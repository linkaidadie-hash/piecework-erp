from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    company: str
    username: str
    password: str
    auth_code: str
    device_key: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    company: str


class EmployeeIn(BaseModel):
    name: str
    employee_no: str
    position: str
    piece_rate: float = Field(default=0, ge=0)
    active: bool = True


class ProcessIn(BaseModel):
    name: str
    default_price: float = Field(default=0, ge=0)
    sort_order: int | None = Field(default=None, ge=0)


class ProcessReorderIn(BaseModel):
    process_ids: list[int] = Field(min_length=1)


class ProductIn(BaseModel):
    name: str
    spec: str = ""
    unit: str = "件"
    default_flow: list[dict[str, Any]] = Field(default_factory=list)


class MaterialIn(BaseModel):
    name: str
    unit: str = "kg"
    stock: float = Field(default=0, ge=0)
    min_stock: float = Field(default=0, ge=0)


class MaterialTxnIn(BaseModel):
    material_id: int
    direction: Literal["in", "out"]
    quantity: float = Field(gt=0)
    reason: str = ""


class FinishedTxnIn(BaseModel):
    product_id: int
    direction: Literal["in", "out"]
    quantity: float = Field(gt=0)
    reason: str = ""


class WorkOrderIn(BaseModel):
    order_no: str
    product_id: int
    quantity: float = Field(gt=0)
    flow: list[dict[str, Any]]
    materials: list[dict[str, Any]] = Field(default_factory=list)


class PieceEntryIn(BaseModel):
    entry_date: date
    order_no: str
    process_name: str
    employee_id: int
    quantity: float = Field(gt=0)


class ScanWorkOrderIn(BaseModel):
    barcode: str
    employee_id: int
    process_name: str
    quantity: float = Field(default=1, gt=0)
    entry_date: date | None = None


class InventoryTxnQuery(BaseModel):
    item_type: Literal["material", "finished"] | None = None
    limit: int = Field(default=100, ge=1, le=500)


class WageSummaryQuery(BaseModel):
    start_date: date | None = None
    end_date: date | None = None


class BootstrapOut(BaseModel):
    ok: bool = True
    company: str
    username: str
    password: str
    auth_code: str
