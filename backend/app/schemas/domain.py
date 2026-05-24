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


class PieceEntryIn(BaseModel):
    entry_date: date
    order_no: str
    process_name: str
    employee_id: int
    quantity: float


class BootstrapOut(BaseModel):
    ok: bool = True
    company: str
    username: str
    password: str
    auth_code: str
