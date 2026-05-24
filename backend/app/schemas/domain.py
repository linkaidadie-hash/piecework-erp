from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class PositiveQuantityMixin(BaseModel):
    @field_validator("quantity", check_fields=False)
    @classmethod
    def quantity_must_be_positive(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("数量必须大于 0")
        return value


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

    @field_validator("piece_rate")
    @classmethod
    def piece_rate_cannot_be_negative(cls, value: float) -> float:
        if value < 0:
            raise ValueError("计件单价不能小于 0")
        return value


class ProcessIn(BaseModel):
    name: str
    default_price: float = 0

    @field_validator("default_price")
    @classmethod
    def default_price_cannot_be_negative(cls, value: float) -> float:
        if value < 0:
            raise ValueError("默认单价不能小于 0")
        return value


class ProductIn(BaseModel):
    name: str
    spec: str = ""
    unit: str = "件"
    default_flow: list[dict[str, Any]] = Field(default_factory=list)


class MaterialIn(BaseModel):
    name: str
    unit: str = "kg"
    stock: float = 0
    min_stock: float = 0


class MaterialTxnIn(PositiveQuantityMixin):
    material_id: int
    direction: Literal["in", "out"]
    quantity: float
    reason: str = ""


class FinishedTxnIn(PositiveQuantityMixin):
    product_id: int
    direction: Literal["in", "out"]
    quantity: float
    reason: str = ""


class WorkOrderIn(PositiveQuantityMixin):
    order_no: str
    product_id: int
    quantity: float
    flow: list[dict[str, Any]]
    materials: list[dict[str, Any]] = Field(default_factory=list)


class PieceEntryIn(PositiveQuantityMixin):
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
