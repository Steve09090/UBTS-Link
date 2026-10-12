"""HTTP API. All business rules live in app/services; these handlers only translate."""
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .clock import now_local
from .config import settings
from .database import SessionLocal
from .isbt128 import ISBT128Error, parse_isbt128
from .models import Movement, Notification, ReorderRule, Requisition, Site, Unit
from .schemas import (
    ParseIn,
    RequisitionIn,
    RequisitionOut,
    RuleIn,
    RuleOut,
    ScanIn,
    ScanOut,
    SiteIn,
    SiteOut,
    UnitOut,
)
from .services import ServiceError
from .services.inventory import get_site, scan, stock_summary
from .services.replenishment import cancel_requisition, create_manual_requisition, run_sweep, set_rule

router = APIRouter(prefix="/api")


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db


def _utc(dt: datetime | None) -> datetime | None:
    """Audit timestamps are stored as naive UTC; mark them so clients convert them correctly."""
    return dt.replace(tzinfo=timezone.utc) if dt is not None else None


def _utc_iso(dt: datetime) -> str:
    return _utc(dt).isoformat(timespec="seconds")


def _unit_out(u: Unit) -> UnitOut:
    return UnitOut(
        din=u.din,
        product_code=u.product_code,
        product_family=u.product_family,
        blood_group=u.blood_group,
        expiry_at=u.expiry_at,
        status=u.status,
        site_code=u.site.code,
        transit_to_code=u.transit_to.code if u.transit_to else None,
    )


def _req_out(r: Requisition) -> RequisitionOut:
    return RequisitionOut(
        id=r.id,
        hospital_code=r.hospital.code,
        hub_code=r.hub.code,
        product_family=r.product_family,
        quantity=r.quantity,
        dispatched_qty=r.dispatched_qty,
        received_qty=r.received_qty,
        status=r.status,
        trigger=r.trigger,
        reason=r.reason,
        created_at=_utc(r.created_at),
        closed_at=_utc(r.closed_at),
    )


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "time": now_local().isoformat(timespec="seconds")}


# ---- sites -----------------------------------------------------------------

@router.get("/sites", response_model=list[SiteOut])
def list_sites(db: Session = Depends(get_db)):
    return [
        SiteOut(code=s.code, name=s.name, kind=s.kind,
                hub_code=s.hub.code if s.hub else None, facility_code=s.facility_code)
        for s in db.scalars(select(Site).order_by(Site.kind, Site.code))
    ]


@router.post("/sites", response_model=SiteOut, status_code=201)
def create_site(body: SiteIn, db: Session = Depends(get_db)):
    if db.scalar(select(Site).where(Site.code == body.code)):
        raise ServiceError(409, f"site '{body.code}' already exists")
    hub = None
    if body.kind == "HOSPITAL":
        if not body.hub_code:
            raise ServiceError(422, "hospitals need a supplying hub_code")
        hub = get_site(db, body.hub_code)
        if hub.kind != "HUB":
            raise ServiceError(422, f"'{body.hub_code}' is not a regional hub")
    site = Site(code=body.code, name=body.name, kind=body.kind, hub=hub,
                facility_code=body.facility_code.upper() if body.facility_code else None)
    db.add(site)
    db.commit()
    return SiteOut(code=site.code, name=site.name, kind=site.kind,
                   hub_code=hub.code if hub else None, facility_code=site.facility_code)


# ---- scanning --------------------------------------------------------------

@router.post("/parse")
def parse_barcode(body: ParseIn) -> dict:
    """Decode an ISBT 128 label without changing any stock. Useful for checking a label."""
    try:
        label = parse_isbt128(body.barcode)
    except ISBT128Error as exc:
        raise ServiceError(422, str(exc)) from exc
    return {
        "din": label.din,
        "din_flags": label.din_flags,
        "product_code": label.product_code,
        "product_family": label.product_family,
        "blood_group_code": label.blood_group,
        "expiry_at": label.expiry_at.isoformat() if label.expiry_at else None,
    }


@router.post("/scan", response_model=ScanOut)
def scan_unit(body: ScanIn, db: Session = Depends(get_db)):
    result = scan(
        db,
        site_code=body.site_code,
        barcode=body.barcode,
        action=body.action,
        destination_code=body.destination_code,
        reference=body.reference,
        note=body.note,
    )
    return ScanOut(
        action=body.action.upper(),
        message=result.message,
        unit=_unit_out(result.unit),
        movement_id=result.movement.id,
        requisitions_created=[_req_out(r) for r in result.requisitions_created],
        requisitions_fulfilled=[_req_out(r) for r in result.requisitions_fulfilled],
    )


@router.get("/units", response_model=list[UnitOut])
def list_units(
    site_code: str | None = None,
    status: str | None = None,
    product_family: str | None = None,
    expiring_within_days: int | None = Query(default=None, ge=0, le=3650),
    limit: int = Query(default=200, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    q = select(Unit)
    if site_code:
        q = q.where(Unit.site_id == get_site(db, site_code).id)
    if status:
        q = q.where(Unit.status == status.upper())
    if product_family:
        q = q.where(Unit.product_family == product_family.upper())
    if expiring_within_days is not None:
        cutoff = now_local() + timedelta(days=expiring_within_days)
        q = q.where(Unit.expiry_at <= cutoff)
    q = q.order_by(Unit.expiry_at, Unit.id).limit(limit)
    return [_unit_out(u) for u in db.scalars(q)]


@router.get("/units/{din}")
def unit_history(din: str, db: Session = Depends(get_db)) -> dict:
    unit = db.scalar(select(Unit).where(Unit.din == din.upper()))
    if unit is None:
        raise ServiceError(404, f"unit {din} is not registered")
    moves = db.scalars(select(Movement).where(Movement.unit_id == unit.id).order_by(Movement.id)).all()
    return {
        "unit": _unit_out(unit).model_dump(mode="json"),
        "movements": [
            {
                "id": m.id,
                "action": m.action,
                "site_code": m.site.code,
                "from_site_code": m.from_site.code if m.from_site else None,
                "to_site_code": m.to_site.code if m.to_site else None,
                "requisition_id": m.requisition_id,
                "reference": m.reference,
                "note": m.note,
                "created_at": _utc_iso(m.created_at),
            }
            for m in moves
        ],
    }


@router.get("/movements")
def list_movements(site_code: str | None = None, limit: int = Query(default=100, ge=1, le=1000),
                   db: Session = Depends(get_db)) -> list[dict]:
    q = select(Movement)
    if site_code:
        q = q.where(Movement.site_id == get_site(db, site_code).id)
    q = q.order_by(Movement.id.desc()).limit(limit)
    return [
        {
            "id": m.id,
            "din": m.unit.din,
            "action": m.action,
            "site_code": m.site.code,
            "to_site_code": m.to_site.code if m.to_site else None,
            "requisition_id": m.requisition_id,
            "created_at": _utc_iso(m.created_at),
        }
        for m in db.scalars(q)
    ]


# ---- inventory & rules -----------------------------------------------------

@router.get("/sites/{code}/stock")
def site_stock(code: str, db: Session = Depends(get_db)) -> dict:
    site = get_site(db, code)
    return {
        "site_code": site.code,
        "kind": site.kind,
        "warning_days": settings.expiry_warning_days,
        "families": stock_summary(db, site, warning_days=settings.expiry_warning_days),
    }


@router.get("/rules", response_model=list[RuleOut])
def list_rules(site_code: str | None = None, db: Session = Depends(get_db)):
    q = select(ReorderRule, Site).join(Site, ReorderRule.site_id == Site.id)
    if site_code:
        q = q.where(Site.code == site_code)
    return [RuleOut(site_code=site.code, product_family=r.product_family,
                    min_level=r.min_level, par_level=r.par_level) for r, site in db.execute(q)]


@router.put("/rules", response_model=RuleOut)
def put_rule(body: RuleIn, db: Session = Depends(get_db)):
    site = get_site(db, body.site_code)
    rule = set_rule(db, site, body.product_family, body.min_level, body.par_level)
    return RuleOut(site_code=site.code, product_family=rule.product_family,
                   min_level=rule.min_level, par_level=rule.par_level)


# ---- requisitions ----------------------------------------------------------

@router.get("/requisitions", response_model=list[RequisitionOut])
def list_requisitions(
    site_code: str | None = None,
    role: str | None = Query(default=None, pattern="^(hospital|hub)$"),
    status: str | None = None,
    db: Session = Depends(get_db),
):
    q = select(Requisition)
    if site_code:
        site = get_site(db, site_code)
        if role == "hub" or (role is None and site.kind == "HUB"):
            q = q.where(Requisition.hub_id == site.id)
        else:
            q = q.where(Requisition.hospital_id == site.id)
    if status:
        q = q.where(Requisition.status == status.upper())
    q = q.order_by(Requisition.id.desc()).limit(500)
    return [_req_out(r) for r in db.scalars(q)]


@router.post("/requisitions", response_model=RequisitionOut, status_code=201)
def manual_requisition(body: RequisitionIn, db: Session = Depends(get_db)):
    hospital = get_site(db, body.hospital_code)
    req = create_manual_requisition(db, hospital, body.product_family, body.quantity, body.reason)
    return _req_out(req)


@router.post("/requisitions/{req_id}/cancel", response_model=RequisitionOut)
def cancel(req_id: int, db: Session = Depends(get_db)):
    req = db.get(Requisition, req_id)
    if req is None:
        raise ServiceError(404, "requisition not found")
    return _req_out(cancel_requisition(db, req))


# ---- notifications & scheduled checks -------------------------------------

@router.get("/notifications")
def list_notifications(site_code: str | None = None, limit: int = Query(default=100, ge=1, le=500),
                       db: Session = Depends(get_db)) -> list[dict]:
    q = select(Notification)
    if site_code:
        q = q.where(Notification.site_id == get_site(db, site_code).id)
    q = q.order_by(Notification.id.desc()).limit(limit)
    return [
        {
            "id": n.id,
            "site_code": n.site.code,
            "kind": n.kind,
            "message": n.message,
            "requisition_id": n.requisition_id,
            "delivered": n.delivered,
            "created_at": _utc_iso(n.created_at),
        }
        for n in db.scalars(q)
    ]


@router.post("/sweep")
def sweep_now(db: Session = Depends(get_db)) -> dict:
    """Run the same checks as the scheduler now: expiry digests and automatic requisitions."""
    return run_sweep(db)
