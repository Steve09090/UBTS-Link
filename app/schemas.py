from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SiteIn(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    name: str = Field(min_length=1, max_length=128)
    kind: Literal["HUB", "HOSPITAL"]
    hub_code: str | None = None
    facility_code: str | None = Field(default=None, min_length=4, max_length=4)


class SiteOut(BaseModel):
    code: str
    name: str
    kind: str
    hub_code: str | None
    facility_code: str | None


class ScanIn(BaseModel):
    site_code: str
    barcode: str = Field(min_length=3, max_length=1000, description="ISBT 128 label data (one or more structures)")
    action: Literal["RECEIVE", "DISPATCH", "DISPENSE", "EXPIRE", "DISCARD"]
    destination_code: str | None = None
    reference: str | None = Field(default=None, max_length=128)
    note: str | None = Field(default=None, max_length=500)


class UnitOut(BaseModel):
    din: str
    product_code: str
    product_family: str
    blood_group: str | None
    expiry_at: datetime
    status: str
    site_code: str
    transit_to_code: str | None


class RequisitionOut(BaseModel):
    id: int
    hospital_code: str
    hub_code: str
    product_family: str
    quantity: int
    dispatched_qty: int
    received_qty: int
    status: str
    trigger: str
    reason: str | None
    created_at: datetime
    closed_at: datetime | None


class ScanOut(BaseModel):
    ok: bool = True
    action: str
    message: str
    unit: UnitOut
    movement_id: int
    requisitions_created: list[RequisitionOut] = []
    requisitions_fulfilled: list[RequisitionOut] = []


class ParseIn(BaseModel):
    barcode: str = Field(min_length=1, max_length=1000)


class RuleIn(BaseModel):
    site_code: str
    product_family: str = Field(min_length=5, max_length=5)
    min_level: int = Field(ge=0)
    par_level: int = Field(ge=0)


class RuleOut(BaseModel):
    site_code: str
    product_family: str
    min_level: int
    par_level: int


class RequisitionIn(BaseModel):
    hospital_code: str
    product_family: str = Field(min_length=5, max_length=5)
    quantity: int = Field(ge=1, le=10000)
    reason: str | None = Field(default=None, max_length=500)
