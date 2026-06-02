from datetime import date
from typing import Any

from pydantic import BaseModel


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
    piece_rate: float = 0
    active: bool = True


class ProcessIn(BaseModel):
    name: str
    default_price: float = 0
    sort_order: int | None = None


class ProcessReorderIn(BaseModel):
    process_ids: list[int]


class ProductIn(BaseModel):
    name: str
    spec: str = ""
    unit: str = "件"
    default_flow: list[dict[str, Any]] = []


class MaterialIn(BaseModel):
    name: str
    unit: str = "kg"
    stock: float = 0
    min_stock: float = 0


class MaterialTxnIn(BaseModel):
    material_id: int
    direction: str
    quantity: float
    reason: str = ""


class FinishedTxnIn(BaseModel):
    product_id: int
    direction: str
    quantity: float
    reason: str = ""


class WorkOrderIn(BaseModel):
    order_no: str
    product_id: int
    quantity: float
    flow: list[dict[str, Any]]
    materials: list[dict[str, Any]] = []
    customer_name: str = ""
    deadline: date | None = None
    notes: str = ""
    barcode: str | None = None  # 留空时由后端自动生成


class WorkOrderProgressOut(BaseModel):
    id: int
    process_name: str
    sort_order: int
    quantity_done: float
    status: str
    last_employee_name: str
    last_entry_at: str | None = None


class PieceEntryIn(BaseModel):
    entry_date: date
    order_no: str | None = None  # 工单号 / 条码二选一
    barcode: str | None = None  # V2 扫码报工：直接传扫码枪读到的条码
    process_name: str
    employee_id: int
    quantity: float


class BootstrapOut(BaseModel):
    ok: bool = True
    company: str
    username: str
    password: str
    auth_code: str
