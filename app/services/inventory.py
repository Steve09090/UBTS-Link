"""Scan handling and stock queries.

Chain of custody:  hub RECEIVE -> hub DISPATCH (unit IN_TRANSIT to hospital)
                   -> hospital RECEIVE -> hospital DISPENSE | EXPIRE | DISCARD
A unit is always held by exactly one site, and every change is written to `movements`.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..clock import now_local
from ..isbt128 import ISBT128Error, ISBTLabel, parse_isbt128
from ..models import Movement, ReorderRule, Requisition, Site, Unit, utcnow
from . import ServiceError
from .replenishment import evaluate_hospital

RECEIVE, DISPATCH, DISPENSE, EXPIRE, DISCARD = "RECEIVE", "DISPATCH", "DISPENSE", "EXPIRE", "DISCARD"
ACTIONS = (RECEIVE, DISPATCH, DISPENSE, EXPIRE, DISCARD)
CLOSED_STATUSES = ("DISPENSED", "EXPIRED", "DISCARDED")


@dataclass
class ScanResult:
    unit: Unit
    movement: Movement
    message: str
    requisitions_created: list[Requisition] = field(default_factory=list)
    requisitions_fulfilled: list[Requisition] = field(default_factory=list)


def get_site(db: Session, code: str) -> Site:
    site = db.scalar(select(Site).where(Site.code == code))
    if site is None:
        raise ServiceError(404, f"unknown site '{code}'")
    return site


def parse_label(barcode: str) -> ISBTLabel:
    try:
        return parse_isbt128(barcode)
    except ISBT128Error as exc:
        raise ServiceError(422, f"invalid ISBT 128 barcode: {exc}") from exc


def _log(
    db: Session,
    unit: Unit,
    action: str,
    site: Site,
    *,
    from_site: Site | None = None,
    to_site: Site | None = None,
    requisition_id: int | None = None,
    reference: str | None = None,
    note: str | None = None,
) -> Movement:
    mv = Movement(
        unit_id=unit.id,
        action=action,
        site_id=site.id,
        from_site_id=from_site.id if from_site else None,
        to_site_id=to_site.id if to_site else None,
        requisition_id=requisition_id,
        reference=reference,
        note=note,
    )
    db.add(mv)
    db.flush()
    return mv


def _apply_receipt(db: Session, unit: Unit, site: Site, movement: Movement) -> list[Requisition]:
    """Count a hospital intake against the requisition the unit was dispatched on, if any."""
    fulfilled: list[Requisition] = []
    if site.kind != "HOSPITAL" or unit.requisition_id is None:
        return fulfilled
    req = db.get(Requisition, unit.requisition_id)
    if req is None or req.status != "OPEN":
        return fulfilled
    req.received_qty += 1
    movement.requisition_id = req.id
    if req.received_qty >= req.quantity:
        req.status = "FULFILLED"
        req.closed_at = utcnow()
        fulfilled.append(req)
    return fulfilled


def _check_label_matches(unit: Unit, label: ISBTLabel) -> None:
    """A later scan of a known DIN must agree with the product and expiry already on record."""
    if label.product_code and label.product_code != unit.product_code:
        raise ServiceError(409, f"label product code {label.product_code} does not match record {unit.product_code}")
    if label.expiry_at and label.expiry_at != unit.expiry_at:
        raise ServiceError(409, f"label expiry {label.expiry_at:%Y-%m-%d %H:%M} does not match record")


def scan(
    db: Session,
    *,
    site_code: str,
    barcode: str,
    action: str,
    destination_code: str | None = None,
    reference: str | None = None,
    note: str | None = None,
) -> ScanResult:
    action = action.upper()
    if action not in ACTIONS:
        raise ServiceError(400, f"unknown action '{action}'")

    site = get_site(db, site_code)
    label = parse_label(barcode)
    if not label.din:
        raise ServiceError(422, "barcode has no ISBT 128 Donation Identification Number (DIN)")
    now = now_local()

    dest: Site | None = None
    if action == DISPATCH:
        if not destination_code:
            raise ServiceError(400, "dispatch needs a destination hospital")
        dest = get_site(db, destination_code)
        if site.kind != "HUB":
            raise ServiceError(409, "units are dispatched from a regional hub")
        if dest.kind != "HOSPITAL":
            raise ServiceError(409, "units can only be dispatched to a hospital")
        if dest.hub_id != site.id:
            hub_code = dest.hub.code if dest.hub else "no hub"
            raise ServiceError(409, f"{dest.code} is supplied by {hub_code}, not {site.code}")

    # Lock the row so two scanners cannot both act on the same unit (no-op on SQLite, row lock on Postgres).
    unit = db.scalar(select(Unit).where(Unit.din == label.din).with_for_update())

    # ---- First sighting of a unit: only intake may register it ----
    if unit is None:
        if action != RECEIVE:
            raise ServiceError(404, f"unit {label.din} is not registered; scan it on intake first")
        if not label.product_code or not label.expiry_at:
            raise ServiceError(422, "first intake scan needs the product code and expiry barcodes as well as the DIN")
        if label.expiry_at <= now:
            raise ServiceError(409, f"unit {label.din} has already expired ({label.expiry_at:%Y-%m-%d %H:%M})")
        unit = Unit(
            din=label.din,
            product_code=label.product_code,
            product_family=label.product_family,
            blood_group=label.blood_group,
            expiry_at=label.expiry_at,
            status="IN_STOCK",
            site_id=site.id,
            barcode_raw=label.raw,
        )
        db.add(unit)
        db.flush()
        mv = _log(db, unit, RECEIVE, site, to_site=site, reference=reference,
                  note=note or "registered on intake")
        fulfilled = _apply_receipt(db, unit, site, mv)
        msg = f"Registered {label.din} into {site.code}"
        created = evaluate_hospital(db, site, now, unit.product_family)
        db.commit()
        return ScanResult(unit, mv, msg, created, fulfilled)

    _check_label_matches(unit, label)
    if unit.status in CLOSED_STATUSES:
        raise ServiceError(409, f"unit {unit.din} is closed ({unit.status.lower()}) and cannot be scanned")

    # ---- RECEIVE (intake) ----
    if action == RECEIVE:
        if unit.expiry_at <= now:
            raise ServiceError(409, f"unit {unit.din} has expired; scan it as EXPIRE instead")
        if unit.status == "IN_TRANSIT":
            if unit.transit_to_id != site.id:
                dest_code = unit.transit_to.code if unit.transit_to else "another site"
                raise ServiceError(409, f"unit {unit.din} is in transit to {dest_code}, not {site.code}")
        elif unit.site_id == site.id:
            raise ServiceError(409, f"unit {unit.din} is already in stock at {site.code} (duplicate scan?)")
        else:
            raise ServiceError(409, f"unit {unit.din} is held at {unit.site.code}; it must be dispatched first")

        previous = unit.site
        unit.site = site
        unit.transit_to = None
        unit.status = "IN_STOCK"
        mv = _log(db, unit, RECEIVE, site, from_site=previous, to_site=site, reference=reference, note=note)
        fulfilled = _apply_receipt(db, unit, site, mv)
        created = evaluate_hospital(db, site, now, unit.product_family)
        msg = f"Received {unit.din} at {site.code}"
        db.commit()
        return ScanResult(unit, mv, msg, created, fulfilled)

    # ---- Every other action requires the unit to be in stock at the scanning site ----
    if unit.status == "IN_TRANSIT":
        dest_code = unit.transit_to.code if unit.transit_to else "another site"
        raise ServiceError(409, f"unit {unit.din} is in transit to {dest_code}; it must be received first")
    if unit.site_id != site.id:
        raise ServiceError(409, f"unit {unit.din} is held at {unit.site.code}, not {site.code}")

    expired = unit.expiry_at <= now
    if action == DISPATCH:
        if expired:
            raise ServiceError(409, f"unit {unit.din} has expired and cannot be dispatched")
        unit.status = "IN_TRANSIT"
        unit.transit_to = dest
        open_req = db.scalar(
            select(Requisition)
            .where(Requisition.hospital_id == dest.id, Requisition.hub_id == site.id,
                   Requisition.product_family == unit.product_family, Requisition.status == "OPEN",
                   Requisition.dispatched_qty < Requisition.quantity)
            .order_by(Requisition.created_at, Requisition.id)
        )
        if open_req is not None:
            open_req.dispatched_qty += 1
            unit.requisition_id = open_req.id
        mv = _log(db, unit, DISPATCH, site, from_site=site, to_site=dest, reference=reference, note=note,
                  requisition_id=open_req.id if open_req else None)
        msg = f"Dispatched {unit.din} to {dest.code} (in transit)"
    elif action == DISPENSE:
        if expired:
            raise ServiceError(409, f"unit {unit.din} has expired; scan it as EXPIRE instead")
        unit.status = "DISPENSED"
        mv = _log(db, unit, DISPENSE, site, from_site=site, reference=reference, note=note)
        msg = f"Dispensed {unit.din} at {site.code}"
    elif action == EXPIRE:
        if not expired:
            raise ServiceError(409, f"unit {unit.din} does not expire until {unit.expiry_at:%Y-%m-%d %H:%M}; use DISCARD for other losses")
        unit.status = "EXPIRED"
        mv = _log(db, unit, EXPIRE, site, from_site=site, reference=reference, note=note)
        msg = f"Expired {unit.din} removed at {site.code}"
    else:  # DISCARD
        unit.status = "DISCARDED"
        mv = _log(db, unit, DISCARD, site, from_site=site, reference=reference, note=note)
        msg = f"Discarded {unit.din} at {site.code}"

    created = evaluate_hospital(db, site, now, unit.product_family)
    db.commit()
    return ScanResult(unit, mv, msg, created, [])


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

def stock_summary(db: Session, site: Site, now: datetime | None = None, warning_days: int = 7) -> list[dict]:
    """Per product family: usable stock, expiry position, incoming units and reorder status.

    usable      = IN_STOCK at this site and not yet expired
    expiring    = usable units that expire within `warning_days`
    expired     = IN_STOCK units past expiry, still awaiting a disposal scan
    incoming    = units in transit to this site
    open_req    = units still owed on open requisitions (hospital: from its hub; hub: owed to hospitals)
    """
    now = now or now_local()
    soon = now + timedelta(days=warning_days)
    in_stock = Unit.status == "IN_STOCK"
    usable = in_stock & (Unit.expiry_at > now)

    rows = db.execute(
        select(
            Unit.product_family,
            func.sum(case((usable, 1), else_=0)).label("on_hand"),
            func.sum(case((usable & (Unit.expiry_at <= soon), 1), else_=0)).label("expiring"),
            func.sum(case((in_stock & (Unit.expiry_at <= now), 1), else_=0)).label("expired"),
        )
        .where(Unit.site_id == site.id, in_stock)
        .group_by(Unit.product_family)
    ).all()

    summary: dict[str, dict] = {}

    def row(family: str) -> dict:
        return summary.setdefault(family, {
            "product_family": family, "on_hand": 0, "expiring_soon": 0, "expired_on_shelf": 0,
            "incoming": 0, "open_requisitions": 0, "min_level": None, "par_level": None, "status": "NO_RULE",
        })

    for r in rows:
        d = row(r.product_family)
        d["on_hand"], d["expiring_soon"], d["expired_on_shelf"] = int(r.on_hand or 0), int(r.expiring or 0), int(r.expired or 0)

    for family, count in db.execute(
        select(Unit.product_family, func.count())
        .where(Unit.transit_to_id == site.id, Unit.status == "IN_TRANSIT")
        .group_by(Unit.product_family)
    ).all():
        row(family)["incoming"] = count

    for rule in db.scalars(select(ReorderRule).where(ReorderRule.site_id == site.id)):
        d = row(rule.product_family)
        d["min_level"], d["par_level"] = rule.min_level, rule.par_level

    unshipped: dict[str, int] = {}
    if site.kind == "HUB":
        # Units the hub still owes to hospitals.
        for req in db.scalars(select(Requisition).where(Requisition.hub_id == site.id, Requisition.status == "OPEN")):
            row(req.product_family)["open_requisitions"] += req.quantity - req.dispatched_qty
    else:
        # Units requested by this hospital and not yet received.
        for req in db.scalars(select(Requisition).where(Requisition.hospital_id == site.id, Requisition.status == "OPEN")):
            row(req.product_family)["open_requisitions"] += req.quantity - req.received_qty
            unshipped[req.product_family] = unshipped.get(req.product_family, 0) + req.quantity - req.dispatched_qty

    for d in summary.values():
        if d["min_level"] is None:
            continue
        # Position counts every unit that is on hand, on its way, or still to be shipped, exactly once.
        position = d["on_hand"] + d["incoming"] + unshipped.get(d["product_family"], 0)
        if d["on_hand"] >= d["min_level"]:
            d["status"] = "OK"
        elif position >= d["min_level"]:
            d["status"] = "ORDERED"   # below minimum on hand, but covered by incoming stock or requisitions
        else:
            d["status"] = "LOW"
    return sorted(summary.values(), key=lambda d: d["product_family"])
