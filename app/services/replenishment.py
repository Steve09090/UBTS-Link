"""Automated replenishment and expiry monitoring.

Reorder rule per hospital and product family:  min_level, par_level.
  position = usable units on hand + units in transit to the hospital + units requested but not yet shipped
  if position < min_level:  raise a requisition to the hospital's hub for (par_level - position).
Each unit is counted once, so a hospital is never ordered twice for the same gap.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..clock import now_local
from ..config import settings
from ..models import Notification, ReorderRule, Requisition, Site, Unit, utcnow
from . import ServiceError
from .notifications import notify


def _usable_count(db: Session, site: Site, family: str, now: datetime) -> int:
    return db.scalar(
        select(func.count()).select_from(Unit).where(
            Unit.site_id == site.id,
            Unit.product_family == family,
            Unit.status == "IN_STOCK",
            Unit.expiry_at > now,
        )
    ) or 0


def _incoming_count(db: Session, hospital: Site, family: str) -> int:
    """Units dispatched to this hospital and not yet scanned in."""
    return db.scalar(
        select(func.count()).select_from(Unit).where(
            Unit.transit_to_id == hospital.id,
            Unit.product_family == family,
            Unit.status == "IN_TRANSIT",
        )
    ) or 0


def _unshipped_count(db: Session, hospital: Site, family: str) -> int:
    """Units requested by this hospital that the hub has not yet dispatched."""
    reqs = db.scalars(select(Requisition).where(
        Requisition.hospital_id == hospital.id,
        Requisition.product_family == family,
        Requisition.status == "OPEN",
    )).all()
    return sum(r.quantity - r.dispatched_qty for r in reqs)


def evaluate_hospital(db: Session, hospital: Site, now: datetime | None = None,
                      family: str | None = None) -> list[Requisition]:
    """Check reorder rules for one hospital (only `family` if given) and raise requisitions where stock is low.

    Does not commit; the caller owns the transaction.
    """
    if hospital.kind != "HOSPITAL" or hospital.hub_id is None:
        return []
    now = now or now_local()
    created: list[Requisition] = []
    q = select(ReorderRule).where(ReorderRule.site_id == hospital.id)
    if family is not None:
        q = q.where(ReorderRule.product_family == family)
    rules = db.scalars(q).all()
    for rule in rules:
        usable = _usable_count(db, hospital, rule.product_family, now)
        incoming = _incoming_count(db, hospital, rule.product_family)
        unshipped = _unshipped_count(db, hospital, rule.product_family)
        position = usable + incoming + unshipped
        if position >= rule.min_level:
            continue
        quantity = rule.par_level - position
        if quantity <= 0:
            continue
        hub = db.get(Site, hospital.hub_id)
        reason = (f"usable {usable} + in transit {incoming} + requested {unshipped} = {position}, "
                  f"below minimum {rule.min_level}; par {rule.par_level}")
        req = Requisition(
            hospital_id=hospital.id,
            hub_id=hub.id,
            product_family=rule.product_family,
            quantity=quantity,
            trigger="AUTO",
            reason=reason,
        )
        db.add(req)
        db.flush()
        created.append(req)
        msg = (f"Requisition #{req.id}: {hospital.code} needs {quantity} x {rule.product_family} "
               f"({reason})")
        notify(db, hub, "REQUISITION", msg, req)
        notify(db, hospital, "LOW_STOCK", msg, req)
    return created


def evaluate_all(db: Session, now: datetime | None = None) -> list[Requisition]:
    now = now or now_local()
    created: list[Requisition] = []
    for hospital in db.scalars(select(Site).where(Site.kind == "HOSPITAL")).all():
        created.extend(evaluate_hospital(db, hospital, now))
    return created


def expiry_alerts(db: Session, now: datetime | None = None, warning_days: int | None = None) -> int:
    """Send at most one expiry digest per site per UTC day for units expired on shelf or expiring soon."""
    now = now or now_local()
    warning_days = settings.expiry_warning_days if warning_days is None else warning_days
    soon = now + timedelta(days=warning_days)
    # Digests are de-duplicated per UTC day, the same clock that stamps Notification.created_at.
    day_start = datetime.combine(utcnow().date(), time.min)
    sent = 0
    for site in db.scalars(select(Site)).all():
        expired = db.scalar(select(func.count()).select_from(Unit).where(
            Unit.site_id == site.id, Unit.status == "IN_STOCK", Unit.expiry_at <= now)) or 0
        expiring = db.scalar(select(func.count()).select_from(Unit).where(
            Unit.site_id == site.id, Unit.status == "IN_STOCK",
            Unit.expiry_at > now, Unit.expiry_at <= soon)) or 0
        if not expired and not expiring:
            continue
        already = db.scalar(select(func.count()).select_from(Notification).where(
            Notification.site_id == site.id, Notification.kind == "EXPIRY",
            Notification.created_at >= day_start)) or 0
        if already:
            continue
        parts = []
        if expired:
            parts.append(f"{expired} unit(s) past expiry awaiting disposal scan")
        if expiring:
            parts.append(f"{expiring} unit(s) expiring within {warning_days} day(s)")
        notify(db, site, "EXPIRY", f"{site.code}: " + "; ".join(parts))
        sent += 1
    return sent


def run_sweep(db: Session) -> dict:
    """Scheduled job: expiry digests, then automatic requisitions. Commits and returns a summary."""
    now = now_local()
    alerts = expiry_alerts(db, now)
    requisitions = evaluate_all(db, now)
    db.commit()
    return {"expiry_alerts": alerts, "requisitions_created": [r.id for r in requisitions]}


# ---------------------------------------------------------------------------
# Manual actions
# ---------------------------------------------------------------------------

def set_rule(db: Session, site: Site, family: str, min_level: int, par_level: int) -> ReorderRule:
    if site.kind != "HOSPITAL":
        raise ServiceError(409, "reorder rules apply to hospitals")
    if len(family) != 5 or not family.isalnum():
        raise ServiceError(422, "product family must be the 5-character ISBT product class, e.g. E0150")
    if min_level < 0 or par_level < min_level:
        raise ServiceError(422, "need 0 <= min_level <= par_level")
    rule = db.scalar(select(ReorderRule).where(ReorderRule.site_id == site.id,
                                               ReorderRule.product_family == family.upper()))
    if rule is None:
        rule = ReorderRule(site_id=site.id, product_family=family.upper(), min_level=min_level, par_level=par_level)
        db.add(rule)
    else:
        rule.min_level, rule.par_level = min_level, par_level
    db.commit()
    return rule


def create_manual_requisition(db: Session, hospital: Site, family: str, quantity: int, reason: str | None) -> Requisition:
    if hospital.kind != "HOSPITAL" or hospital.hub_id is None:
        raise ServiceError(409, "requisitions are raised by hospitals that have a supplying hub")
    if quantity < 1:
        raise ServiceError(422, "quantity must be at least 1")
    hub = db.get(Site, hospital.hub_id)
    req = Requisition(hospital_id=hospital.id, hub_id=hub.id, product_family=family.upper(), quantity=quantity,
                      trigger="MANUAL", reason=reason or "manual request")
    db.add(req)
    db.flush()
    msg = f"Requisition #{req.id}: {hospital.code} requested {quantity} x {req.product_family} (manual)"
    notify(db, hub, "REQUISITION", msg, req)
    db.commit()
    return req


def cancel_requisition(db: Session, req: Requisition) -> Requisition:
    if req.status != "OPEN":
        raise ServiceError(409, f"requisition is already {req.status.lower()}")
    req.status = "CANCELLED"
    req.closed_at = utcnow()
    notify(db, req.hub, "REQUISITION_CANCELLED",
           f"Requisition #{req.id} from {req.hospital.code} was cancelled", req)
    db.commit()
    return req
