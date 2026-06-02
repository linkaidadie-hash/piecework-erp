import json
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.config import settings
from app.core.license import license_status, require_valid_license, verify_license_data, write_license
from app.core.security import create_access_token, hash_password, verify_password
from app.db import get_db
from app.models import Employee, FinishedGood, InventoryTxn, Material, PieceEntry, Process, Product, Role, Tenant, User, WorkOrder
from app.schemas import (
    BootstrapOut,
    EmployeeIn,
    FinishedTxnIn,
    LoginIn,
    MaterialIn,
    MaterialTxnIn,
    PieceEntryIn,
    ProcessIn,
    ProcessReorderIn,
    ProductIn,
    TokenOut,
    WorkOrderIn,
)

router = APIRouter()


def model_dict(obj, extra: dict | None = None):
    data = {col.name: getattr(obj, col.name) for col in obj.__table__.columns}
    data.update(extra or {})
    return data


def ensure_sort_order_column(db: Session):
    if db.bind and db.bind.dialect.name == "sqlite":
        columns = [row[1] for row in db.execute(text("PRAGMA table_info(processes)")).all()]
        if "sort_order" not in columns:
            db.execute(text("ALTER TABLE processes ADD COLUMN sort_order INTEGER DEFAULT 0"))
            db.commit()
    elif db.bind and db.bind.dialect.name == "postgresql":
        exists = db.scalar(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = 'processes' AND column_name = 'sort_order'"
            )
        )
        if not exists:
            db.execute(text("ALTER TABLE processes ADD COLUMN sort_order INTEGER DEFAULT 0"))
            db.commit()


def ensure_non_negative_stock(current_stock: float, quantity: float, item_name: str):
    if current_stock - quantity < 0:
        raise HTTPException(status_code=400, detail=f"{item_name}库存不足")


def get_tenant_product(db: Session, tenant_id: int, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if not product or product.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="产品不存在")
    return product


@router.post("/bootstrap", response_model=BootstrapOut)
def bootstrap(db: Session = Depends(get_db)):
    require_valid_license()
    company = "演示企业"
    username = "admin"
    password = "admin123456"
    auth_code = "DEMO-ERP-2026"
    tenant = db.scalar(select(Tenant).where(Tenant.name == company))
    if not tenant:
        tenant = Tenant(
            name=company,
            auth_code=auth_code,
            bound_domain=settings.default_domain,
            expires_at=date.today() + timedelta(days=365),
        )
        db.add(tenant)
        db.flush()
        db.add(User(tenant_id=tenant.id, username=username, password_hash=hash_password(password), role=Role.admin))
        db.add_all(
            [
                Process(tenant_id=tenant.id, name="裁剪", default_price=0.08, sort_order=10),
                Process(tenant_id=tenant.id, name="车缝", default_price=0.18, sort_order=20),
                Process(tenant_id=tenant.id, name="包装", default_price=0.05, sort_order=30),
                Employee(tenant_id=tenant.id, name="张三", employee_no="E001", position="车缝", piece_rate=0.18),
                Material(tenant_id=tenant.id, name="面料", unit="米", stock=500, min_stock=100),
                Material(tenant_id=tenant.id, name="纽扣", unit="颗", stock=3000, min_stock=500),
                Product(tenant_id=tenant.id, name="演示产品", spec="标准款", unit="件", default_flow=json.dumps([{"name": "裁剪", "price": 0.08}, {"name": "车缝", "price": 0.18}, {"name": "包装", "price": 0.05}], ensure_ascii=False)),
            ]
        )
        db.commit()
    return BootstrapOut(company=company, username=username, password=password, auth_code=auth_code)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    require_valid_license()
    tenant = db.scalar(select(Tenant).where(Tenant.name == payload.company, Tenant.auth_code == payload.auth_code))
    if not tenant:
        raise HTTPException(status_code=401, detail="企业或授权码错误")
    user = db.scalar(select(User).where(User.tenant_id == tenant.id, User.username == payload.username))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="账号或密码错误")
    if payload.device_key and user.device_key and user.device_key != payload.device_key:
        raise HTTPException(status_code=403, detail="设备未授权")
    if payload.device_key and not user.device_key:
        user.device_key = payload.device_key
        db.commit()
    token = create_access_token(str(user.id), {"tenant_id": tenant.id, "role": user.role.value})
    return TokenOut(access_token=token, role=user.role.value, company=tenant.name)


@router.get("/license/status")
def get_license_status():
    return license_status()


@router.post("/license/import")
def import_license(payload: dict):
    valid, message = verify_license_data(payload)
    if not valid:
        raise HTTPException(status_code=400, detail=message)
    write_license(payload)
    return license_status()


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tenant = db.get(Tenant, user.tenant_id)
    return {"username": user.username, "role": user.role.value, "company": tenant.name if tenant else ""}


@router.get("/employees")
def list_employees(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [model_dict(x) for x in db.scalars(select(Employee).where(Employee.tenant_id == user.tenant_id)).all()]


@router.post("/employees")
def create_employee(payload: EmployeeIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    data = payload.model_dump()
    process = db.scalar(select(Process).where(Process.tenant_id == user.tenant_id, Process.name == data["position"]))
    if process and not data.get("piece_rate"):
        data["piece_rate"] = process.default_price
    obj = Employee(tenant_id=user.tenant_id, **data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return model_dict(obj)


@router.put("/employees/{employee_id}")
def update_employee(employee_id: int, payload: EmployeeIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = db.get(Employee, employee_id)
    if not obj or obj.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="员工不存在")
    data = payload.model_dump()
    for key, value in data.items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return model_dict(obj)


@router.get("/processes")
def list_processes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ensure_sort_order_column(db)
    processes = db.scalars(select(Process).where(Process.tenant_id == user.tenant_id).order_by(Process.sort_order, Process.id)).all()
    changed = False
    for index, process in enumerate(processes, start=1):
        if not process.sort_order:
            process.sort_order = index * 10
            changed = True
    if changed:
        db.commit()
    return [model_dict(x) for x in processes]


@router.post("/processes")
def create_process(payload: ProcessIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    ensure_sort_order_column(db)
    data = payload.model_dump()
    if data.get("sort_order") is None:
        max_order = db.scalar(select(func.max(Process.sort_order)).where(Process.tenant_id == user.tenant_id)) or 0
        data["sort_order"] = max_order + 10
    obj = Process(tenant_id=user.tenant_id, **data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return model_dict(obj)


@router.put("/processes/{process_id}")
def update_process(process_id: int, payload: ProcessIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = db.get(Process, process_id)
    if not obj or obj.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="工序不存在")
    old_name = obj.name
    data = payload.model_dump()
    obj.name = data["name"]
    obj.default_price = data["default_price"]
    if data.get("sort_order") is not None:
        obj.sort_order = data["sort_order"]
    employees = db.scalars(select(Employee).where(Employee.tenant_id == user.tenant_id, Employee.position == old_name)).all()
    for employee in employees:
        employee.position = obj.name
        employee.piece_rate = obj.default_price
    db.commit()
    db.refresh(obj)
    return model_dict(obj)


@router.post("/processes/reorder")
def reorder_processes(payload: ProcessReorderIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    ensure_sort_order_column(db)
    processes = db.scalars(select(Process).where(Process.tenant_id == user.tenant_id)).all()
    by_id = {process.id: process for process in processes}
    if set(payload.process_ids) != set(by_id):
        raise HTTPException(status_code=400, detail="工序排序数据不完整")
    for index, process_id in enumerate(payload.process_ids, start=1):
        by_id[process_id].sort_order = index * 10
    db.commit()
    ordered = sorted(processes, key=lambda item: (item.sort_order, item.id))
    return [model_dict(x) for x in ordered]


@router.get("/products")
def list_products(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    products = db.scalars(select(Product).where(Product.tenant_id == user.tenant_id)).all()
    return [model_dict(x, {"default_flow": json.loads(x.default_flow or "[]")}) for x in products]


@router.post("/products")
def create_product(payload: ProductIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["default_flow"] = json.dumps(data["default_flow"], ensure_ascii=False)
    obj = Product(tenant_id=user.tenant_id, **data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    if not db.scalar(select(FinishedGood).where(FinishedGood.tenant_id == user.tenant_id, FinishedGood.product_id == obj.id)):
        db.add(FinishedGood(tenant_id=user.tenant_id, product_id=obj.id, stock=0))
        db.commit()
    return model_dict(obj, {"default_flow": json.loads(obj.default_flow or "[]")})


@router.get("/materials")
def list_materials(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [model_dict(x) for x in db.scalars(select(Material).where(Material.tenant_id == user.tenant_id)).all()]


@router.post("/materials")
def create_material(payload: MaterialIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    obj = Material(tenant_id=user.tenant_id, **payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return model_dict(obj)


@router.post("/materials/txn")
def material_txn(payload: MaterialTxnIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    mat = db.get(Material, payload.material_id)
    if not mat or mat.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="原料不存在")
    if payload.direction == "out":
        ensure_non_negative_stock(mat.stock, payload.quantity, mat.name)
    mat.stock += payload.quantity if payload.direction == "in" else -payload.quantity
    db.add(InventoryTxn(tenant_id=user.tenant_id, item_type="material", item_id=mat.id, direction=payload.direction, quantity=payload.quantity, reason=payload.reason))
    db.commit()
    return model_dict(mat)


@router.get("/inventory-txns")
def list_inventory_txns(
    item_type: str | None = Query(default=None, pattern="^(material|finished)$"),
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(InventoryTxn).where(InventoryTxn.tenant_id == user.tenant_id)
    if item_type:
        stmt = stmt.where(InventoryTxn.item_type == item_type)
    txns = db.scalars(stmt.order_by(InventoryTxn.created_at.desc(), InventoryTxn.id.desc()).limit(limit)).all()
    material_ids = [txn.item_id for txn in txns if txn.item_type == "material"]
    product_ids = [txn.item_id for txn in txns if txn.item_type == "finished"]
    materials = {
        item.id: item.name
        for item in db.scalars(select(Material).where(Material.tenant_id == user.tenant_id, Material.id.in_(material_ids))).all()
    } if material_ids else {}
    products = {
        item.id: item.name
        for item in db.scalars(select(Product).where(Product.tenant_id == user.tenant_id, Product.id.in_(product_ids))).all()
    } if product_ids else {}
    rows = []
    for txn in txns:
        item_name = materials.get(txn.item_id) if txn.item_type == "material" else products.get(txn.item_id)
        rows.append(model_dict(txn, {"item_name": item_name or "-"}))
    return rows


@router.get("/finished-goods")
def list_finished_goods(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(FinishedGood, Product).join(Product, Product.id == FinishedGood.product_id).where(FinishedGood.tenant_id == user.tenant_id)
    ).all()
    return [{"id": fg.id, "product_id": fg.product_id, "product_name": p.name, "spec": p.spec, "unit": p.unit, "stock": fg.stock} for fg, p in rows]


@router.post("/finished-goods/txn")
def finished_txn(payload: FinishedTxnIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_tenant_product(db, user.tenant_id, payload.product_id)
    fg = db.scalar(select(FinishedGood).where(FinishedGood.tenant_id == user.tenant_id, FinishedGood.product_id == payload.product_id))
    if not fg:
        fg = FinishedGood(tenant_id=user.tenant_id, product_id=payload.product_id, stock=0)
        db.add(fg)
        db.flush()
    if payload.direction == "out":
        ensure_non_negative_stock(fg.stock, payload.quantity, "成品")
    fg.stock += payload.quantity if payload.direction == "in" else -payload.quantity
    db.add(InventoryTxn(tenant_id=user.tenant_id, item_type="finished", item_id=payload.product_id, direction=payload.direction, quantity=payload.quantity, reason=payload.reason))
    db.commit()
    return model_dict(fg)


@router.get("/work-orders")
def list_work_orders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    orders = db.scalars(select(WorkOrder).where(WorkOrder.tenant_id == user.tenant_id).order_by(WorkOrder.created_at.desc())).all()
    return [model_dict(x, {"flow": json.loads(x.flow or "[]"), "materials": json.loads(x.materials or "[]"), "product_name": x.product.name}) for x in orders]


@router.post("/work-orders")
def create_work_order(payload: WorkOrderIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    get_tenant_product(db, user.tenant_id, payload.product_id)
    if db.scalar(select(WorkOrder).where(WorkOrder.tenant_id == user.tenant_id, WorkOrder.order_no == payload.order_no)):
        raise HTTPException(status_code=400, detail="工单号已存在")
    data = payload.model_dump()
    materials = data.pop("materials")
    flow = data.pop("flow")
    material_totals: dict[int, float] = {}
    for item in materials:
        try:
            material_id = int(item["material_id"])
            qty = float(item["quantity"])
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="扣料数据格式错误") from exc
        if qty <= 0:
            raise HTTPException(status_code=400, detail="扣料数量必须大于 0")
        material_totals[material_id] = material_totals.get(material_id, 0) + qty
    normalized_materials = [{"material_id": material_id, "quantity": qty} for material_id, qty in material_totals.items()]
    for item in normalized_materials:
        mat = db.get(Material, item["material_id"])
        qty = item["quantity"]
        if not mat or mat.tenant_id != user.tenant_id:
            raise HTTPException(status_code=404, detail="原料不存在")
        ensure_non_negative_stock(mat.stock, qty, mat.name)
        mat.stock -= qty
        db.add(InventoryTxn(tenant_id=user.tenant_id, item_type="material", item_id=mat.id, direction="out", quantity=qty, reason=f"工单 {payload.order_no} 开始扣料"))
    obj = WorkOrder(tenant_id=user.tenant_id, **data, flow=json.dumps(flow, ensure_ascii=False), materials=json.dumps(normalized_materials, ensure_ascii=False))
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return model_dict(obj, {"flow": flow, "materials": normalized_materials})


@router.get("/work-orders/{order_id}/print")
def print_sheet(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = db.get(WorkOrder, order_id)
    if not order or order.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="工单不存在")
    return {"order": model_dict(order, {"flow": json.loads(order.flow or "[]"), "materials": json.loads(order.materials or "[]"), "product_name": order.product.name})}


@router.get("/piece-entries")
def list_piece_entries(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entries = db.scalars(select(PieceEntry).where(PieceEntry.tenant_id == user.tenant_id).order_by(PieceEntry.entry_date.desc())).all()
    return [model_dict(x, {"employee_name": x.employee.name, "order_no": x.work_order.order_no}) for x in entries]


@router.post("/piece-entries")
def create_piece_entry(payload: PieceEntryIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = db.scalar(select(WorkOrder).where(WorkOrder.tenant_id == user.tenant_id, WorkOrder.order_no == payload.order_no))
    emp = db.get(Employee, payload.employee_id)
    if not order or not emp or emp.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="工单或员工不存在")
    if not emp.active:
        raise HTTPException(status_code=400, detail="员工已停用，不能录入计件")
    if order.status == "已完成":
        raise HTTPException(status_code=400, detail="工单已完工，不能继续录入")
    flow = json.loads(order.flow or "[]")
    process = next((x for x in flow if x.get("name") == payload.process_name), None)
    if flow and not process:
        raise HTTPException(status_code=400, detail="工序不在当前工单流程中")
    unit_price = float(process.get("price", 0)) if process else emp.piece_rate
    wage = payload.quantity * unit_price
    obj = PieceEntry(tenant_id=user.tenant_id, work_order_id=order.id, process_name=payload.process_name, employee_id=emp.id, quantity=payload.quantity, unit_price=unit_price, wage=wage, entry_date=payload.entry_date)
    is_final_process = bool(flow) and payload.process_name == flow[-1].get("name")
    if is_final_process:
        remaining_quantity = order.quantity - order.completed_quantity
        if remaining_quantity <= 0:
            raise HTTPException(status_code=400, detail="工单已完工，不能继续录入末工序")
        if payload.quantity > remaining_quantity:
            raise HTTPException(status_code=400, detail=f"录入数量不能超过剩余数量 {remaining_quantity:g}")
        order.completed_quantity += payload.quantity
        if order.completed_quantity >= order.quantity:
            order.status = "已完成"
        fg = db.scalar(select(FinishedGood).where(FinishedGood.tenant_id == user.tenant_id, FinishedGood.product_id == order.product_id))
        if not fg:
            fg = FinishedGood(tenant_id=user.tenant_id, product_id=order.product_id, stock=0)
            db.add(fg)
        fg.stock += payload.quantity
        db.add(InventoryTxn(tenant_id=user.tenant_id, item_type="finished", item_id=order.product_id, direction="in", quantity=payload.quantity, reason=f"工单 {order.order_no} 完工入库"))
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return model_dict(obj, {"employee_name": emp.name, "order_no": order.order_no})


@router.get("/wages/summary")
def wage_summary(
    start_date: date | None = None,
    end_date: date | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Employee.id, Employee.name, func.sum(PieceEntry.quantity), func.sum(PieceEntry.wage))
        .join(Employee, Employee.id == PieceEntry.employee_id)
        .where(PieceEntry.tenant_id == user.tenant_id)
        .group_by(Employee.id, Employee.name)
        .order_by(func.sum(PieceEntry.wage).desc())
    )
    if start_date:
        stmt = stmt.where(PieceEntry.entry_date >= start_date)
    if end_date:
        stmt = stmt.where(PieceEntry.entry_date <= end_date)
    rows = db.execute(stmt).all()
    total_quantity = sum(quantity or 0 for _, _, quantity, _ in rows)
    total_wage = sum(wage or 0 for _, _, _, wage in rows)
    return {
        "start_date": start_date,
        "end_date": end_date,
        "total_quantity": total_quantity,
        "total_wage": total_wage,
        "rows": [
            {"employee_id": employee_id, "employee_name": name, "quantity": quantity or 0, "wage": wage or 0}
            for employee_id, name, quantity, wage in rows
        ],
    }


@router.get("/dashboard")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = date.today()
    today_entries = db.scalars(select(PieceEntry).where(PieceEntry.tenant_id == user.tenant_id, PieceEntry.entry_date == today)).all()
    ranking = db.execute(
        select(Employee.name, func.sum(PieceEntry.quantity), func.sum(PieceEntry.wage))
        .join(Employee, Employee.id == PieceEntry.employee_id)
        .where(PieceEntry.tenant_id == user.tenant_id, PieceEntry.entry_date == today)
        .group_by(Employee.name)
        .order_by(func.sum(PieceEntry.wage).desc())
    ).all()
    materials = db.scalars(select(Material).where(Material.tenant_id == user.tenant_id)).all()
    orders = db.scalars(select(WorkOrder).where(WorkOrder.tenant_id == user.tenant_id)).all()
    return {
        "today_quantity": sum(x.quantity for x in today_entries),
        "today_wage": sum(x.wage for x in today_entries),
        "work_orders": [model_dict(x, {"product_name": x.product.name}) for x in orders],
        "materials": [model_dict(x) for x in materials],
        "low_materials": [model_dict(x) for x in materials if x.stock <= x.min_stock],
        "finished_goods": list_finished_goods(user, db),
        "ranking": [{"employee_name": name, "quantity": qty or 0, "wage": wage or 0} for name, qty, wage in ranking],
    }
