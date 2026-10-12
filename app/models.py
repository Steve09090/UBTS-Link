"""Central database schema."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    """Naive UTC timestamp (SQLite and Postgres both store it without tz info)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Site(Base):
    """A UBTS regional hub or a hospital that is supplied by a hub."""

    __tablename__ = "sites"
    __table_args__ = (CheckConstraint("kind IN ('HUB', 'HOSPITAL')", name="ck_site_kind"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(16))
    # Hospitals point at the hub that replenishes them.
    hub_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), nullable=True)
    # Four-character facility identification number (FIN) used in DINs issued by this site.
    facility_code: Mapped[str | None] = mapped_column(String(4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    hub: Mapped["Site | None"] = relationship(remote_side="Site.id")


class Unit(Base):
    """A single blood unit identified by its ISBT 128 Donation Identification Number."""

    __tablename__ = "units"
    __table_args__ = (
        CheckConstraint(
            "status IN ('IN_STOCK', 'IN_TRANSIT', 'DISPENSED', 'EXPIRED', 'DISCARDED')",
            name="ck_unit_status",
        ),
        Index("ix_units_site_status_product", "site_id", "status", "product_family"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    din: Mapped[str] = mapped_column(String(13), unique=True)
    product_code: Mapped[str] = mapped_column(String(8))
    product_family: Mapped[str] = mapped_column(String(5))
    blood_group: Mapped[str | None] = mapped_column(String(4), nullable=True)
    expiry_at: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(16), default="IN_STOCK")
    # Custodian: the site that physically holds the unit (for IN_TRANSIT, the dispatching hub).
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    transit_to_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), nullable=True)
    # Requisition this unit was dispatched against, if any (set by hub dispatch).
    requisition_id: Mapped[int | None] = mapped_column(ForeignKey("requisitions.id"), nullable=True)
    barcode_raw: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    site: Mapped[Site] = relationship(foreign_keys=[site_id])
    transit_to: Mapped[Site | None] = relationship(foreign_keys=[transit_to_id])


class Movement(Base):
    """Append-only event log: every scan and automated change to a unit."""

    __tablename__ = "movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), index=True)
    action: Mapped[str] = mapped_column(String(16))  # RECEIVE, DISPATCH, DISPENSE, EXPIRE, DISCARD
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))  # where the scan happened
    from_site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), nullable=True)
    to_site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), nullable=True)
    requisition_id: Mapped[int | None] = mapped_column(ForeignKey("requisitions.id"), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    unit: Mapped[Unit] = relationship()
    site: Mapped[Site] = relationship(foreign_keys=[site_id])
    from_site: Mapped[Site | None] = relationship(foreign_keys=[from_site_id])
    to_site: Mapped[Site | None] = relationship(foreign_keys=[to_site_id])


class ReorderRule(Base):
    """Minimum and par levels for one hospital and one product family."""

    __tablename__ = "reorder_rules"
    __table_args__ = (
        UniqueConstraint("site_id", "product_family", name="uq_rule_site_family"),
        CheckConstraint("min_level >= 0 AND par_level >= min_level", name="ck_rule_levels"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    product_family: Mapped[str] = mapped_column(String(5))
    min_level: Mapped[int] = mapped_column(Integer)
    par_level: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    site: Mapped[Site] = relationship()


class Requisition(Base):
    """A replenishment request from a hospital to its regional hub."""

    __tablename__ = "requisitions"
    __table_args__ = (
        CheckConstraint("status IN ('OPEN', 'FULFILLED', 'CANCELLED')", name="ck_req_status"),
        CheckConstraint("quantity > 0 AND received_qty >= 0 AND dispatched_qty >= 0", name="ck_req_qty"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hospital_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True)
    hub_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True)
    product_family: Mapped[str] = mapped_column(String(5))
    quantity: Mapped[int] = mapped_column(Integer)
    dispatched_qty: Mapped[int] = mapped_column(Integer, default=0)  # units the hub has shipped against it
    received_qty: Mapped[int] = mapped_column(Integer, default=0)    # units the hospital has scanned in
    status: Mapped[str] = mapped_column(String(16), default="OPEN")
    trigger: Mapped[str] = mapped_column(String(8), default="AUTO")  # AUTO or MANUAL
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    hospital: Mapped[Site] = relationship(foreign_keys=[hospital_id])
    hub: Mapped[Site] = relationship(foreign_keys=[hub_id])


class Notification(Base):
    """Alert sent to a site (hub or hospital). Also pushed to UBTS_WEBHOOK_URL when configured."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(Text)
    requisition_id: Mapped[int | None] = mapped_column(ForeignKey("requisitions.id"), nullable=True)
    delivered: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    site: Mapped[Site] = relationship()
