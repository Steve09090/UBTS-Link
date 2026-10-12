"""Demo data: two hubs, three hospitals, reorder rules and a stock history built through the real scan path.

    python -m app.seed            # seed an empty database (no-op if sites already exist)
    python -m app.seed --reset    # drop and recreate all tables first (destroys data)

Also writes sample_data/intake_labels.txt: complete ISBT 128 labels for units that have not
been scanned yet, so intake can be tried straight away.
"""
import argparse
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import select

from .clock import now_local
from .database import Base, SessionLocal, engine, init_db
from .isbt128 import build_din_barcode, build_expiry_barcode, build_product_code_barcode
from .models import Site, Unit
from .services.inventory import DISPATCH, DISPENSE, RECEIVE, scan
from .services.replenishment import run_sweep, set_rule

SAMPLE_DIR = Path(__file__).resolve().parent.parent / "sample_data"
PRODUCTS = {"E0150": "E0150V00", "E0701": "E0701V00"}  # demo product codes (family + attributes)


def intake_label(facility: str, serial: int, family: str, expires: datetime, year: int | None = None) -> str:
    """Complete intake label: DIN + product code + expiry date/time."""
    year = year or now_local().year
    return (build_din_barcode(facility, year, serial)
            + build_product_code_barcode(PRODUCTS[family])
            + build_expiry_barcode(expires))


def din_only(din: str) -> str:
    """DIN-only scan (as used for dispatch, dispense and expiry): '=' + 13-character DIN + flags."""
    return f"={din}00"


def _end_of_day(days_from_now: int) -> datetime:
    return (now_local() + timedelta(days=days_from_now)).replace(hour=23, minute=59, second=0, microsecond=0)


def _units_at(db, site_code: str, family: str | None = None) -> list[Unit]:
    site = db.scalar(select(Site).where(Site.code == site_code))
    q = select(Unit).where(Unit.site_id == site.id, Unit.status == "IN_STOCK")
    if family:
        q = q.where(Unit.product_family == family)
    return list(db.scalars(q.order_by(Unit.expiry_at, Unit.id)))


def seed(reset: bool = False) -> None:
    if reset:
        Base.metadata.drop_all(engine)
    init_db()
    with SessionLocal() as db:
        if db.scalar(select(Site.id)):
            print("database already contains sites; nothing to do (use --reset to rebuild)")
            return

        north = Site(code="HUB-NORTH", name="Northern UBTS Regional Hub", kind="HUB", facility_code="N001")
        coast = Site(code="HUB-COAST", name="Coastal UBTS Regional Hub", kind="HUB", facility_code="C002")
        db.add_all([north, coast])
        db.flush()
        db.add_all([
            Site(code="HOSP-A", name="Riverside General Hospital", kind="HOSPITAL", hub=north),
            Site(code="HOSP-B", name="St Mary's Teaching Hospital", kind="HOSPITAL", hub=north),
            Site(code="HOSP-C", name="Harbour Clinic Hospital", kind="HOSPITAL", hub=coast),
        ])
        db.commit()
        for code in ("HOSP-A", "HOSP-B", "HOSP-C"):
            hospital = db.scalar(select(Site).where(Site.code == code))
            set_rule(db, hospital, "E0150", min_level=4, par_level=8)
            set_rule(db, hospital, "E0701", min_level=3, par_level=6)

        serial = 1000

        def next_serial() -> int:
            nonlocal serial
            serial += 1
            return serial

        # 1. Hub intake: registration of units from the UBTS processing facilities.
        for family, days, count in (("E0150", 35, 20), ("E0701", 12, 10), ("E0150", 3, 2)):
            for _ in range(count):
                scan(db, site_code="HUB-NORTH", action=RECEIVE,
                     barcode=intake_label("N001", next_serial(), family, _end_of_day(days)))
        for _ in range(8):
            scan(db, site_code="HUB-COAST", action=RECEIVE,
                 barcode=intake_label("C002", next_serial(), "E0150", _end_of_day(28)))

        # 2. Hub dispatch (DIN-only scans) and hospital intake (scan on arrival).
        def ship(hub: str, hospital: str, units: list[Unit]) -> None:
            for u in units:
                scan(db, site_code=hub, action=DISPATCH, destination_code=hospital, barcode=din_only(u.din))
            for u in units:
                scan(db, site_code=hospital, action=RECEIVE, barcode=din_only(u.din))

        # Ship long-dated stock; the 3-day units stay at the hub so it raises an expiry alert.
        def long_dated(units: list[Unit]) -> list[Unit]:
            return [u for u in units if u.expiry_at > _end_of_day(7)]

        ship("HUB-NORTH", "HOSP-A", long_dated(_units_at(db, "HUB-NORTH", "E0150"))[:7])
        ship("HUB-NORTH", "HOSP-B", long_dated(_units_at(db, "HUB-NORTH", "E0701"))[:4])
        ship("HUB-COAST", "HOSP-C", long_dated(_units_at(db, "HUB-COAST", "E0150"))[:5])

        # 3. Clinical use at Riverside: dispensing drops stock below minimum, so a requisition
        #    goes to HUB-NORTH automatically.
        for u in _units_at(db, "HOSP-A", "E0150")[:6]:
            scan(db, site_code="HOSP-A", action=DISPENSE, barcode=din_only(u.din), reference="demo-ward")

        # 4. The hub ships part of that requisition; the hospital scans it in. It stays OPEN (3 of 5 received).
        open_req = long_dated(_units_at(db, "HUB-NORTH", "E0150"))
        for u in open_req[:3]:
            scan(db, site_code="HUB-NORTH", action=DISPATCH, destination_code="HOSP-A", barcode=din_only(u.din))
        for u in open_req[:3]:
            scan(db, site_code="HOSP-A", action=RECEIVE, barcode=din_only(u.din))

        # 5. Run the scheduled checks once so the demo starts with current alerts.
        summary = run_sweep(db)
        print(f"sweep: {summary}")

    _write_sample_labels()
    print("seeded hubs HUB-NORTH and HUB-COAST, hospitals HOSP-A, HOSP-B and HOSP-C")
    print(f"sample intake labels: {SAMPLE_DIR / 'intake_labels.txt'}")


def _write_sample_labels() -> None:
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Complete ISBT 128 intake labels for UBTS-Link, one per line. These units are NOT yet registered.",
        "# Scan a line at HUB-NORTH with action RECEIVE to register the unit.",
    ]
    for serial, family, days in ((9001, "E0150", 30), (9002, "E0701", 9), (9003, "E0150", 21)):
        lines.append(intake_label("N001", serial, family, _end_of_day(days)))
    (SAMPLE_DIR / "intake_labels.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="drop all tables before seeding")
    args = parser.parse_args()
    seed(reset=args.reset)


if __name__ == "__main__":
    main()
