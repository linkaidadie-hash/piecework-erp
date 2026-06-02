import enum
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Role(str, enum.Enum):
    admin = "admin"
    clerk = "clerk"
    warehouse = "warehouse"
    employee = "employee"


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    auth_code: Mapped[str] = mapped_column(String(80), unique=True)
    bound_domain: Mapped[str | None] = mapped_column(String(160), nullable=True)
    bound_ip: Mapped[str | None] = mapped_column(String(80), nullable=True)
    max_devices: Mapped[int] = mapped_column(default=5)
    expires_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    username: Mapped[str] = mapped_column(String(80), index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.admin)
    device_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("tenant_id", "username"),)


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    employee_no: Mapped[str] = mapped_column(String(50))
    position: Mapped[str] = mapped_column(String(80))
    piece_rate: Mapped[float] = mapped_column(Float, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (UniqueConstraint("tenant_id", "employee_no"),)


class Process(Base):
    __tablename__ = "processes"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    default_price: Mapped[float] = mapped_column(Float, default=0)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    spec: Mapped[str] = mapped_column(String(120), default="")
    unit: Mapped[str] = mapped_column(String(40), default="件")
    default_flow: Mapped[str] = mapped_column(Text, default="[]")


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    unit: Mapped[str] = mapped_column(String(40), default="kg")
    stock: Mapped[float] = mapped_column(Float, default=0)
    min_stock: Mapped[float] = mapped_column(Float, default=0)


class FinishedGood(Base):
    __tablename__ = "finished_goods"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    stock: Mapped[float] = mapped_column(Float, default=0)


class InventoryTxn(Base):
    __tablename__ = "inventory_txns"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    item_type: Mapped[str] = mapped_column(String(20))
    item_id: Mapped[int] = mapped_column(Integer)
    direction: Mapped[str] = mapped_column(String(10))
    quantity: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(String(160), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    order_no: Mapped[str] = mapped_column(String(80), index=True)
    barcode: Mapped[str] = mapped_column(String(80), index=True)
    customer_name: Mapped[str | None] = mapped_column(String(120), default="")
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(30), default="进行中")
    flow: Mapped[str] = mapped_column(Text, default="[]")
    materials: Mapped[str] = mapped_column(Text, default="[]")
    completed_quantity: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    product: Mapped[Product] = relationship()


class WorkOrderProcessProgress(Base):
    """工单每道工序的实时进度（V2 工序追踪用）.

    一次计件录入即代表对应工序出量。
    - 工序完成量 >= 工单数量时, status = 'done' (看板显示 ✓)
    - 否则 status = 'in_progress' (看板显示 ✗ / 进行中)
    """

    __tablename__ = "work_order_process_progress"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    work_order_id: Mapped[int] = mapped_column(ForeignKey("work_orders.id"), index=True)
    process_name: Mapped[str] = mapped_column(String(80))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    quantity_done: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending / in_progress / done
    last_employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    last_employee_name: Mapped[str] = mapped_column(String(80), default="")
    last_entry_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("work_order_id", "process_name"),)


class PieceEntry(Base):
    __tablename__ = "piece_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    work_order_id: Mapped[int] = mapped_column(ForeignKey("work_orders.id"))
    process_name: Mapped[str] = mapped_column(String(80))
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    quantity: Mapped[float] = mapped_column(Float)
    unit_price: Mapped[float] = mapped_column(Float)
    wage: Mapped[float] = mapped_column(Float)
    entry_date: Mapped[date] = mapped_column(Date, default=date.today)

    employee: Mapped[Employee] = relationship()
    work_order: Mapped[WorkOrder] = relationship()
