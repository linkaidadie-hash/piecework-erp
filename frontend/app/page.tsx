"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Boxes,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Factory,
  FileText,
  LogOut,
  Package,
  Pencil,
  Printer,
  QrCode,
  Save,
  ScanLine,
  ShieldCheck,
  Upload,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { api, LicenseStatus, money, Session } from "@/lib/api";

type Row = Record<string, any>;

type ProcessProgress = {
  id: number;
  process_name: string;
  sort_order: number;
  quantity_done: number;
  status: "pending" | "in_progress" | "done";
  last_employee_name: string;
  last_entry_at: string | null;
};

function nextOrderNo() {
  const now = new Date();
  const date = now.toISOString().slice(2, 10).replace(/-/g, "");
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
  return `WO-${date}-${time}`;
}

const tabs = [
  ["dashboard", "看板", BarChart3],
  ["piece", "扫码报工", ScanLine],
  ["orders", "工单", ClipboardList],
  ["employees", "员工", Users],
  ["processes", "工序", Factory],
  ["products", "产品", Package],
  ["materials", "原料", Boxes],
  ["finished", "成品", Package],
  ["license", "授权", ShieldCheck],
] as const;

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [active, setActive] = useState("dashboard");
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, Row[] | Row>>({});

  useEffect(() => {
    const saved = localStorage.getItem("erp-session");
    if (saved) setSession(JSON.parse(saved));
  }, []);

  async function refresh(token = session?.token) {
    if (!token) return;
    const [dashboard, employees, processes, products, materials, finished, orders, entries] = await Promise.all([
      api<Row>("/dashboard", {}, token),
      api<Row[]>("/employees", {}, token),
      api<Row[]>("/processes", {}, token),
      api<Row[]>("/products", {}, token),
      api<Row[]>("/materials", {}, token),
      api<Row[]>("/finished-goods", {}, token),
      api<Row[]>("/work-orders", {}, token),
      api<Row[]>("/piece-entries", {}, token),
    ]);
    setData({ dashboard, employees, processes, products, materials, finished, orders, entries });
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [session]);

  if (!session) return <Login onLogin={(next) => { setSession(next); localStorage.setItem("erp-session", JSON.stringify(next)); refresh(next.token); }} />;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Factory size={19} /></div>
          <div>
            <div>工厂轻 MES 计件管理系统 V2</div>
            <small>{session.company}</small>
          </div>
        </div>
        <nav className="tabs">
          {tabs.map(([key, label, Icon]) => (
            <button className={`tab ${active === key ? "active" : ""}`} key={key} onClick={() => setActive(key)} title={label}>
              <Icon size={17} /> {label}
            </button>
          ))}
        </nav>
        <button className="logout" title="退出登录" onClick={() => { localStorage.removeItem("erp-session"); setSession(null); }}>
          <LogOut size={18} />
        </button>
      </header>
      <main className="main">
        {error && <p className="error">{error}</p>}
        {active === "dashboard" && <Dashboard dashboard={data.dashboard as Row} />}
        {active === "piece" && <Piece entries={data.entries as Row[]} employees={data.employees as Row[]} orders={data.orders as Row[]} processes={data.processes as Row[]} token={session.token} onDone={refresh} />}
        {active === "orders" && <Orders rows={data.orders as Row[]} products={data.products as Row[]} materials={data.materials as Row[]} token={session.token} onDone={refresh} />}
        {active === "employees" && <Employees rows={data.employees as Row[]} processes={data.processes as Row[]} token={session.token} onDone={refresh} />}
        {active === "processes" && <Processes rows={data.processes as Row[]} token={session.token} onDone={refresh} />}
        {active === "products" && <Products rows={data.products as Row[]} processes={data.processes as Row[]} token={session.token} onDone={refresh} />}
        {active === "materials" && <Materials rows={data.materials as Row[]} token={session.token} onDone={refresh} />}
        {active === "finished" && <Finished rows={data.finished as Row[]} products={data.products as Row[]} token={session.token} onDone={refresh} />}
        {active === "license" && <LicenseManager />}
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [form, setForm] = useState({ company: "演示企业", username: "admin", password: "admin123456", auth_code: "DEMO-ERP-2026" });
  const [error, setError] = useState("");
  const [license, setLicense] = useState<LicenseStatus | null>(null);

  async function refreshLicense() {
    setLicense(await api<LicenseStatus>("/license/status"));
  }

  useEffect(() => {
    refreshLicense().catch((err) => setError(err.message));
  }, []);

  async function submit() {
    setError("");
    try {
      await api("/bootstrap", { method: "POST", body: "{}" });
      const device_key = localStorage.getItem("erp-device") || crypto.randomUUID();
      localStorage.setItem("erp-device", device_key);
      const res = await api<{ access_token: string; company: string; role: string }>("/login", { method: "POST", body: JSON.stringify({ ...form, device_key }) });
      onLogin({ token: res.access_token, company: res.company, role: res.role });
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (!license || !license.valid) {
    return (
      <div className="login">
        <div className="license-shell">
          <LicenseManager initialStatus={license} onStatus={setLicense} />
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      <div className="login-panel">
        <h1>工厂轻 MES 计件管理系统 V2</h1>
        <p className="hint">本机授权已通过。请输入企业账号登录系统。</p>
        <div className="form one">
          {[
            ["company", "企业名称"],
            ["username", "账号"],
            ["password", "密码", "password"],
            ["auth_code", "授权码"],
          ].map(([key, label, type]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input type={type || "text"} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </div>
          ))}
          <button className="primary" onClick={submit}><LogOut size={17} /> 登录</button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function LicenseManager({ initialStatus, onStatus }: { initialStatus?: LicenseStatus | null; onStatus?: (status: LicenseStatus) => void }) {
  const [status, setStatus] = useState<LicenseStatus | null>(initialStatus ?? null);
  const [message, setMessage] = useState("");

  async function refresh() {
    const next = await api<LicenseStatus>("/license/status");
    setStatus(next);
    onStatus?.(next);
  }

  useEffect(() => {
    if (!initialStatus) refresh().catch((err) => setMessage(err.message));
  }, []);

  async function importFile(file?: File) {
    if (!file) return;
    setMessage("");
    try {
      const licenseData = JSON.parse(await file.text());
      const next = await api<LicenseStatus>("/license/import", { method: "POST", body: JSON.stringify(licenseData) });
      setStatus(next);
      onStatus?.(next);
      setMessage(next.message);
    } catch (err: any) {
      setMessage(err.message || "授权文件导入失败");
    }
  }

  async function copyMachineId() {
    if (!status?.machineId) return;
    await navigator.clipboard.writeText(status.machineId);
    setMessage("机器码已复制");
  }

  return (
    <section className="panel license-panel">
      <div className="section-head">
        <h2>授权管理</h2>
        <span className={`status ${status?.valid ? "" : "danger"}`}>{status?.message || "读取授权状态"}</span>
      </div>
      <div className="license-status">
        <div>
          <label>本机机器码</label>
          <code>{status?.machineId || "正在读取..."}</code>
        </div>
        <button className="secondary" onClick={copyMachineId} disabled={!status?.machineId} title="复制机器码"><Copy size={17} /> 复制</button>
      </div>
      {status?.license && (
        <div className="license-grid">
          <Metric label="客户名称" value={status.license.customerName || "-"} sub={status.license.licenseCode || "授权编号"} />
          <Metric label="版本" value={status.license.edition || "-"} sub={`用户数 ${status.license.maxUsers || 1}`} />
          <Metric label="有效期" value={status.license.expireAt || "-"} sub={`签发 ${status.license.issuedAt || "-"}`} />
        </div>
      )}
      <label className="upload-license">
        <Upload size={17} /> 导入 license.dat
        <input type="file" accept=".dat,.json,application/json" onChange={(e) => importFile(e.target.files?.[0])} />
      </label>
      {message && <p className={status?.valid ? "success" : "error"}>{message}</p>}
      <p className="hint">把本机机器码发给销售方，收到 license.dat 后在这里导入。客户软件不提供授权生成入口。</p>
    </section>
  );
}

function ProcessTracker({ progress, orderQty }: { progress: ProcessProgress[]; orderQty: number }) {
  if (!progress || progress.length === 0) {
    return <span className="hint">本工单未配置工序流程</span>;
  }
  return (
    <div className="process-tracker">
      {progress.map((step) => {
        const isDone = step.status === "done";
        const isInProgress = step.status === "in_progress";
        return (
          <div className={`process-step ${isDone ? "done" : isInProgress ? "active" : "pending"}`} key={step.id || step.process_name}>
            <div className="process-step-icon">
              {isDone ? <Check size={14} /> : isInProgress ? <AlertTriangle size={14} /> : <XCircle size={14} />}
            </div>
            <div className="process-step-body">
              <div className="process-step-name">{step.process_name}</div>
              <div className="process-step-meta">
                {step.quantity_done}/{orderQty}
                {step.last_employee_name ? ` · ${step.last_employee_name}` : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({ dashboard = {} }: { dashboard?: Row }) {
  const stats = dashboard.stats || { in_progress_count: 0, completed_count: 0, overdue_count: 0 };
  const inProgress = (dashboard.in_progress_orders || []) as Row[];
  const completed = (dashboard.completed_orders || []) as Row[];
  const overdue = (dashboard.overdue_orders || []) as Row[];
  const lowMaterials = (dashboard.low_materials || []) as Row[];
  return (
    <>
      <div className="section-head">
        <h2>生产看板 · 老板版</h2>
        <span className="status">实时汇总 · 手机可用</span>
      </div>
      <div className="grid">
        <Metric label="今日产量" value={dashboard.today_quantity || 0} sub="按计件录入汇总" />
        <Metric label="今日工资" value={`¥ ${money(dashboard.today_wage)}`} sub="系统自动计算" />
        <Metric label="进行中工单" value={stats.in_progress_count || 0} sub="进行中的工单数量" />
        <Metric label="已延期" value={stats.overdue_count || 0} sub="超交期未完工" warn={(stats.overdue_count || 0) > 0} />
        <Metric label="已完成" value={stats.completed_count || 0} sub="近 7 天累计" />
        <Metric label="缺料提醒" value={lowMaterials.length} sub={lowMaterials.length ? "请尽快补料" : "库存正常"} warn={lowMaterials.length > 0} />

        {overdue.length > 0 && (
          <section className="panel span-12">
            <div className="section-head">
              <h2 className="danger"><AlertTriangle size={18} /> 延期工单 · 红色提醒</h2>
              <span className="status danger">需立即处理</span>
            </div>
            <div className="order-cards">
              {overdue.map((order) => (
                <OrderCard key={order.id} order={order} variant="overdue" />
              ))}
            </div>
          </section>
        )}

        <section className="panel span-12">
          <div className="section-head">
            <h2>进行中工单 · 工序追踪</h2>
            <span className="status">{inProgress.length} 单</span>
          </div>
          {inProgress.length === 0 ? <p className="hint">当前没有进行中的工单</p> : (
            <div className="order-cards">
              {inProgress.map((order) => (
                <OrderCard key={order.id} order={order} variant="in_progress" />
              ))}
            </div>
          )}
        </section>

        <section className="panel span-7">
          <div className="section-head">
            <h2><ClipboardList size={18} /> 库存预警</h2>
            <span className="status">低于安全库存</span>
          </div>
          {lowMaterials.length === 0 ? (
            <p className="hint">所有原料库存充足</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>原料</th><th>当前库存</th><th>预警线</th><th>单位</th><th>差额</th></tr>
                </thead>
                <tbody>
                  {lowMaterials.map((m) => (
                    <tr key={m.id}>
                      <td className="danger">{m.name}</td>
                      <td className="danger">{m.stock}</td>
                      <td>{m.min_stock}</td>
                      <td>{m.unit}</td>
                      <td className="danger">{Number(m.min_stock - m.stock).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <Table title="员工计件排名" rows={(dashboard.ranking || []) as Row[]} cols={[["employee_name", "员工"], ["quantity", "数量"], ["wage", "工资"]]} span="span-5" />
        <section className="panel span-12">
          <div className="section-head">
            <h2><CheckCircle2 size={18} /> 今日已完成工单</h2>
            <span className="status">{completed.length} 单</span>
          </div>
          {completed.length === 0 ? <p className="hint">今天还没有完工工单</p> : (
            <div className="order-cards">
              {completed.slice(0, 8).map((order) => (
                <OrderCard key={order.id} order={order} variant="done" />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function OrderCard({ order, variant }: { order: Row; variant: "in_progress" | "done" | "overdue" }) {
  const daysToDeadline = order.deadline ? Math.ceil((new Date(order.deadline).getTime() - Date.now()) / 86400000) : null;
  return (
    <div className={`order-card variant-${variant}`}>
      <div className="order-card-head">
        <div>
          <div className="order-card-no">{order.order_no}</div>
          <div className="order-card-product">{order.product_name}{order.spec ? ` · ${order.spec}` : ""}</div>
          {order.customer_name ? <div className="order-card-customer">客户：{order.customer_name}</div> : null}
        </div>
        <div className="order-card-meta">
          <div className="order-card-qty">
            <span className="order-card-qty-done">{order.completed_quantity}</span>
            <span className="order-card-qty-total">/ {order.quantity}</span>
          </div>
          {order.deadline ? (
            <div className={`order-card-deadline ${variant === "overdue" ? "danger" : daysToDeadline !== null && daysToDeadline <= 3 ? "warn" : ""}`}>
              <CalendarClock size={13} /> {order.deadline}
            </div>
          ) : null}
        </div>
      </div>
      {order.barcode ? (
        <div className="order-card-barcode">
          <QrCode size={13} /> <code>{order.barcode}</code>
        </div>
      ) : null}
      <ProcessTracker progress={(order.progress || []) as ProcessProgress[]} orderQty={Number(order.quantity || 0)} />
    </div>
  );
}

function Metric({ label, value, sub, warn }: { label: string; value: any; sub: string; warn?: boolean }) {
  return <div className="panel metric span-3"><div className="metric-label">{label}</div><div className={`metric-value ${warn ? "danger" : ""}`}>{value}</div><div className="metric-sub">{sub}</div></div>;
}

function Table({ title, rows = [], cols, span = "span-12" }: { title: string; rows?: Row[]; cols: string[][]; span?: string }) {
  return (
    <section className={`panel ${span}`}>
      <div className="section-head"><h2>{title}</h2></div>
      <div className="table-wrap">
        <table>
          <thead><tr>{cols.map((c) => <th key={c[0]}>{c[1]}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={row.id || index}>{cols.map((c) => <td key={c[0]}>{String(row[c[0]] ?? "")}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function Crud({ title, rows = [], token, path, fields, onDone }: { title: string; rows?: Row[]; token: string; path: string; fields: string[][]; onDone: () => void }) {
  const initial = Object.fromEntries(fields.map(([key, , type]) => [key, type === "number" ? 0 : ""]));
  const [form, setForm] = useState<Row>(initial);
  async function submit() {
    await api(path, { method: "POST", body: JSON.stringify(form) }, token);
    setForm(initial);
    onDone();
  }
  return (
    <div className="grid">
      <section className="panel span-4">
        <div className="section-head"><h2>{title}</h2></div>
        <div className="form one">{fields.map(([key, label, type]) => <Input key={key} label={label} type={type} value={form[key]} onChange={(v) => setForm({ ...form, [key]: type === "number" ? Number(v) : v })} />)}<button className="primary" onClick={submit}><Save size={17} /> 保存</button></div>
      </section>
      <Table title="列表" rows={rows} cols={fields.map(([key, label]) => [key, label])} span="span-8" />
    </div>
  );
}

function Employees({ rows = [], processes = [], token, onDone }: { rows?: Row[]; processes?: Row[]; token: string; onDone: () => void }) {
  const empty = { name: "", employee_no: "", position: "", piece_rate: 0, active: true };
  const [form, setForm] = useState<Row>(empty);
  const [editingId, setEditingId] = useState<number | null>(null);
  const processOptions = processes.map((process) => [process.name, `${process.name} / ${money(process.default_price)}`]);

  function applyPosition(position: string) {
    const process = processes.find((item) => item.name === position);
    setForm({ ...form, position, piece_rate: Number(process?.default_price ?? form.piece_rate ?? 0) });
  }

  function edit(row: Row) {
    setEditingId(Number(row.id));
    setForm({
      name: row.name || "",
      employee_no: row.employee_no || "",
      position: row.position || "",
      piece_rate: Number(row.piece_rate || 0),
      active: row.active ?? true,
    });
  }

  function reset() {
    setEditingId(null);
    setForm(empty);
  }

  async function submit() {
    const method = editingId ? "PUT" : "POST";
    const path = editingId ? `/employees/${editingId}` : "/employees";
    await api(path, { method, body: JSON.stringify({ ...form, piece_rate: Number(form.piece_rate || 0), active: Boolean(form.active) }) }, token);
    reset();
    onDone();
  }

  const cols = [["name", "姓名"], ["employee_no", "工号"], ["position", "岗位/工序"], ["piece_rate", "计件单价"], ["active", "启用"]];

  return (
    <div className="grid">
      <section className="panel span-4">
        <div className="section-head"><h2>{editingId ? "修改员工" : "员工管理"}</h2></div>
        <div className="form one">
          <Input label="姓名" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Input label="工号" value={form.employee_no} onChange={(v) => setForm({ ...form, employee_no: v })} />
          <Select label="岗位/工序" value={form.position} onChange={applyPosition} options={processOptions} />
          <Input label="计件单价" type="number" value={form.piece_rate} onChange={(v) => setForm({ ...form, piece_rate: Number(v) })} />
          <Select label="是否启用" value={form.active ? "1" : "0"} onChange={(v) => setForm({ ...form, active: v === "1" })} options={[["1", "启用"], ["0", "停用"]]} />
          <div className="row-actions">
            <button className="primary" onClick={submit}><Save size={17} /> {editingId ? "更新" : "保存"}</button>
            {editingId && <button className="secondary" onClick={reset}><X size={17} /> 取消</button>}
          </div>
        </div>
      </section>
      <section className="panel span-8">
        <div className="section-head"><h2>员工列表</h2><span className="status">岗位单价默认跟随工序</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>{cols.map((col) => <th key={col[0]}>{col[1]}</th>)}<th>操作</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {cols.map(([key]) => <td key={key}>{key === "piece_rate" ? money(row[key]) : key === "active" ? (row[key] ? "启用" : "停用") : String(row[key] ?? "")}</td>)}
                  <td><button className="icon-button" onClick={() => edit(row)} title="修改"><Pencil size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Processes({ rows = [], token, onDone }: { rows?: Row[]; token: string; onDone: () => void }) {
  const [form, setForm] = useState({ name: "", default_price: 0 });
  const [editingId, setEditingId] = useState<number | null>(null);

  async function submit() {
    const method = editingId ? "PUT" : "POST";
    const path = editingId ? "/processes/" + editingId : "/processes";
    await api(path, { method, body: JSON.stringify({ ...form, default_price: Number(form.default_price || 0) }) }, token);
    reset();
    onDone();
  }

  function edit(row: Row) {
    setEditingId(Number(row.id));
    setForm({ name: row.name || "", default_price: Number(row.default_price || 0) });
  }

  function reset() {
    setEditingId(null);
    setForm({ name: "", default_price: 0 });
  }

  async function move(index: number, offset: number) {
    const next = [...rows];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await api("/processes/reorder", { method: "POST", body: JSON.stringify({ process_ids: next.map((row) => row.id) }) }, token);
    onDone();
  }

  return (
    <div className="grid">
      <section className="panel span-4">
        <div className="section-head"><h2>岗位/工序管理</h2></div>
        <div className="form one">
          <Input label="工序名称" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Input label="默认单价" type="number" value={form.default_price} onChange={(v) => setForm({ ...form, default_price: Number(v) })} />
          <div className="row-actions">
            <button className="primary" onClick={submit}><Save size={17} /> {editingId ? "更新" : "保存"}</button>
            {editingId && <button className="secondary" onClick={reset}><X size={17} /> 取消</button>}
          </div>
        </div>
      </section>
      <section className="panel span-8">
        <div className="section-head"><h2>工序顺序</h2><span className="status">修改默认单价会同步同岗位员工</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>顺序</th><th>工序名称</th><th>默认单价</th><th>位置</th><th>操作</th></tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>{row.name}</td>
                  <td>{money(row.default_price)}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-button" onClick={() => move(index, -1)} disabled={index === 0} title="上移"><ArrowUp size={16} /></button>
                      <button className="icon-button" onClick={() => move(index, 1)} disabled={index === rows.length - 1} title="下移"><ArrowDown size={16} /></button>
                    </div>
                  </td>
                  <td><button className="icon-button" onClick={() => edit(row)} title="修改"><Pencil size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Products({ rows = [], processes = [], token, onDone }: { rows?: Row[]; processes?: Row[]; token: string; onDone: () => void }) {
  const [form, setForm] = useState({ name: "", spec: "", unit: "件", default_flow: [] as Row[] });
  const flow = processes.map((p) => ({ name: p.name, price: p.default_price }));
  async function submit() {
    await api("/products", { method: "POST", body: JSON.stringify({ ...form, default_flow: flow }) }, token);
    setForm({ name: "", spec: "", unit: "件", default_flow: [] });
    onDone();
  }
  return <div className="grid"><section className="panel span-4"><div className="section-head"><h2>产品管理</h2></div><div className="form one"><Input label="产品名称" value={form.name} onChange={(v) => setForm({ ...form, name: v })} /><Input label="规格" value={form.spec} onChange={(v) => setForm({ ...form, spec: v })} /><Input label="成品单位" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} /><button className="primary" onClick={submit}><Save size={17} /> 保存</button></div></section><Table title="列表" rows={rows} cols={[["name", "产品"], ["spec", "规格"], ["unit", "单位"]]} span="span-8" /></div>;
}

function Materials({ rows = [], token, onDone }: { rows?: Row[]; token: string; onDone: () => void }) {
  return <Crud title="原材料库存" rows={rows} token={token} path="/materials" fields={[["name", "原料名称"], ["unit", "单位"], ["stock", "当前库存", "number"], ["min_stock", "预警线", "number"]]} onDone={onDone} />;
}

function Finished({ rows = [], products = [], token, onDone }: { rows?: Row[]; products?: Row[]; token: string; onDone: () => void }) {
  const [form, setForm] = useState({ product_id: "", direction: "out", quantity: 0, reason: "出货" });
  async function submit() {
    await api("/finished-goods/txn", { method: "POST", body: JSON.stringify({ ...form, product_id: Number(form.product_id) }) }, token);
    onDone();
  }
  return <div className="grid"><section className="panel span-4"><div className="section-head"><h2>成品出入库</h2></div><div className="form one"><Select label="产品" value={form.product_id} onChange={(v) => setForm({ ...form, product_id: v })} options={products.map((p) => [p.id, p.name])} /><Select label="方向" value={form.direction} onChange={(v) => setForm({ ...form, direction: v })} options={[["in", "入库"], ["out", "出货"]]} /><Input label="数量" type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: Number(v) })} /><Input label="原因" value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} /><button className="primary" onClick={submit}><Save size={17} /> 保存</button></div></section><Table title="成品库存" rows={rows} cols={[["product_name", "产品"], ["spec", "规格"], ["stock", "库存"], ["unit", "单位"]]} span="span-8" /></div>;
}

function Orders({ rows = [], products = [], materials = [], token, onDone }: { rows?: Row[]; products?: Row[]; materials?: Row[]; token: string; onDone: () => void }) {
  const emptyMaterial = { material_id: "", quantity: "" };
  const [form, setForm] = useState({
    order_no: nextOrderNo(),
    product_id: "",
    quantity: "",
    materials: [emptyMaterial],
    customer_name: "",
    deadline: "",
    notes: "",
  });
  const [showPrint, setShowPrint] = useState<Row | null>(null);
  const product = products.find((p) => String(p.id) === String(form.product_id));

  function updateMaterial(index: number, patch: Row) {
    const next = form.materials.map((item, i) => i === index ? { ...item, ...patch } : item);
    setForm({ ...form, materials: next });
  }

  function addMaterial() {
    setForm({ ...form, materials: [...form.materials, { ...emptyMaterial }] });
  }

  function removeMaterial(index: number) {
    const next = form.materials.filter((_, i) => i !== index);
    setForm({ ...form, materials: next.length ? next : [{ ...emptyMaterial }] });
  }

  async function submit() {
    const materialRows = form.materials
      .filter((item) => item.material_id && Number(item.quantity) > 0)
      .map((item) => ({ material_id: Number(item.material_id), quantity: Number(item.quantity) }));
    const payload = {
      order_no: form.order_no,
      product_id: Number(form.product_id),
      quantity: Number(form.quantity || 0),
      flow: product?.default_flow || [],
      materials: materialRows,
      customer_name: form.customer_name || "",
      deadline: form.deadline || null,
      notes: form.notes || "",
    };
    const created = await api<Row>("/work-orders", { method: "POST", body: JSON.stringify(payload) }, token);
    setForm({ order_no: nextOrderNo(), product_id: "", quantity: "", materials: [{ ...emptyMaterial }], customer_name: "", deadline: "", notes: "" });
    setShowPrint(created);
    onDone();
  }

  return (
    <div className="grid">
      <section className="panel span-4">
        <div className="section-head"><h2>工单录入</h2></div>
        <div className="form one">
          <Input label="工单号" value={form.order_no} onChange={(v) => setForm({ ...form, order_no: v })} />
          <Input label="客户名称" value={form.customer_name} onChange={(v) => setForm({ ...form, customer_name: v })} placeholder="可选, 例如: 深圳某某电子" />
          <Select label="产品" value={form.product_id} onChange={(v) => setForm({ ...form, product_id: v })} options={products.map((p) => [p.id, String(p.name || "") + " " + String(p.spec || "")])} />
          <Input label="生产数量" type="number" value={form.quantity} placeholder="请输入生产数量" onChange={(v) => setForm({ ...form, quantity: v })} />
          <Input label="交期" type="date" value={form.deadline} onChange={(v) => setForm({ ...form, deadline: v })} />
          <Input label="备注" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="可选" />
          <div className="sub-form">
            <div className="section-head compact"><h2>扣减原材料</h2><button className="secondary" onClick={addMaterial}>新增</button></div>
            {form.materials.map((item, index) => (
              <div className="material-row" key={index}>
                <Select label="原料" value={item.material_id} onChange={(v) => updateMaterial(index, { material_id: v })} options={materials.map((m) => [m.id, m.name])} />
                <Input label="数量" type="number" value={item.quantity} placeholder="请输入扣减数量" onChange={(v) => updateMaterial(index, { quantity: v })} />
                {form.materials.length > 1 && <button className="icon-button" onClick={() => removeMaterial(index)} title="删除"><X size={16} /></button>}
              </div>
            ))}
          </div>
          <button className="primary" onClick={submit}><Save size={17} /> 开工 (自动生成条码)</button>
        </div>
      </section>
      <section className="panel span-8">
        <div className="section-head">
          <h2>工单列表 · 工序追踪</h2>
          <button className="secondary" onClick={() => window.print()}><Printer size={17} /> 打印流程单</button>
        </div>
        <div className="print-sheet">
          <Table title="纸质流程单" rows={rows} cols={[["order_no", "工单号"], ["product_name", "产品"], ["quantity", "数量"], ["completed_quantity", "已完成"], ["status", "状态"]]} />
          <div className="signature-grid">{["裁剪", "车缝", "包装", "质检"].map((x) => <div key={x}>{x}<br />员工签名：</div>)}</div>
        </div>
        <div className="order-cards" style={{ marginTop: 16 }}>
          {rows.map((order) => (
            <div key={order.id} className="order-card-list">
              <div className="order-card-head">
                <div>
                  <div className="order-card-no">{order.order_no}</div>
                  <div className="order-card-product">{order.product_name}{order.spec ? ` · ${order.spec}` : ""}</div>
                  {order.customer_name ? <div className="order-card-customer">客户：{order.customer_name}</div> : null}
                </div>
                <div className="order-card-meta">
                  <div className="order-card-qty">
                    <span className="order-card-qty-done">{order.completed_quantity}</span>
                    <span className="order-card-qty-total">/ {order.quantity}</span>
                  </div>
                  {order.deadline ? <div className="order-card-deadline"><CalendarClock size={13} /> {order.deadline}</div> : null}
                </div>
              </div>
              {order.barcode ? (
                <div className="order-card-barcode">
                  <QrCode size={13} /> <code>{order.barcode}</code>
                </div>
              ) : null}
              <ProcessTracker progress={(order.progress || []) as ProcessProgress[]} orderQty={Number(order.quantity || 0)} />
              <div className="row-actions" style={{ marginTop: 8 }}>
                <button className="secondary" onClick={() => setShowPrint(order)}><Printer size={14} /> 打印条码</button>
              </div>
            </div>
          ))}
        </div>
      </section>
      {showPrint && <BarcodePrint order={showPrint} onClose={() => setShowPrint(null)} />}
    </div>
  );
}

function BarcodePrint({ order, onClose }: { order: Row; onClose: () => void }) {
  return (
    <div className="print-overlay" onClick={onClose}>
      <div className="print-card" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <h2>工单条码 · 扫码枪扫这个</h2>
          <button className="icon-button" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="barcode-block">
          <div className="barcode-meta">
            <div><strong>工单号：</strong>{order.order_no}</div>
            <div><strong>产品：</strong>{order.product_name}{order.spec ? ` / ${order.spec}` : ""}</div>
            <div><strong>数量：</strong>{order.quantity}</div>
            {order.deadline ? <div><strong>交期：</strong>{order.deadline}</div> : null}
            {order.customer_name ? <div><strong>客户：</strong>{order.customer_name}</div> : null}
          </div>
          <div className="barcode-value">
            <code>{order.barcode}</code>
          </div>
          <div className="barcode-stripes" aria-hidden>
            {order.barcode?.split("").map((ch: string, i: number) => (
              <span key={i} style={{ height: 8 + (ch.charCodeAt(0) % 24) }} />
            ))}
          </div>
          <p className="hint">把此页打印贴在工位上，员工用扫码枪扫上方条码即可报工。</p>
        </div>
        <div className="row-actions">
          <button className="primary" onClick={() => window.print()}><Printer size={16} /> 打印</button>
          <button className="secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}

function Piece({ entries = [], employees = [], orders = [], processes = [], token, onDone }: { entries?: Row[]; employees?: Row[]; orders?: Row[]; processes?: Row[]; token: string; onDone: () => void }) {
  const [form, setForm] = useState({ entry_date: new Date().toISOString().slice(0, 10), order_no: "", barcode: "", process_name: "", employee_id: "", quantity: 0 });
  const barcodeRef = useRef<HTMLInputElement | null>(null);
  const qtyRef = useRef<HTMLInputElement | null>(null);

  // 优先按 barcode 找工单
  const order = useMemo(() => {
    if (form.barcode) {
      const hit = orders.find((o) => o.barcode === form.barcode);
      if (hit) return hit;
    }
    return orders.find((o) => o.order_no === form.order_no);
  }, [form.barcode, form.order_no, orders]);

  const processOptions = useMemo(() => {
    if (order?.flow && order.flow.length > 0) {
      return (order.flow as Row[]).map((f) => [f.name, `${f.name} ¥${f.price}`]);
    }
    return processes.map((p) => [p.name, p.name]);
  }, [order, processes]);

  // 扫码后自动定位工序列表 & 聚焦数量
  useEffect(() => {
    if (form.barcode && order && !form.process_name) {
      const first = (order.flow || [])[0];
      if (first) setForm((prev) => ({ ...prev, process_name: first.name }));
    }
    if (form.barcode && order) {
      setTimeout(() => qtyRef.current?.focus(), 50);
    }
  }, [form.barcode, order]);

  async function lookupBarcode() {
    if (!form.barcode) return;
    try {
      const found = await api<Row>(`/work-orders/by-barcode/${encodeURIComponent(form.barcode)}`, {}, token);
      if (found && found.order_no) {
        setForm((prev) => ({ ...prev, order_no: found.order_no, process_name: (found.flow || [])[0]?.name || "" }));
      }
    } catch (err) {
      // 后端没找到时给个提示
      setError("条码未找到，请检查");
    }
  }

  function reset() {
    setForm({ entry_date: new Date().toISOString().slice(0, 10), order_no: "", barcode: "", process_name: "", employee_id: "", quantity: 0 });
    setTimeout(() => barcodeRef.current?.focus(), 50);
  }

  async function submit() {
    if (!form.order_no && !form.barcode) {
      setError("请扫码或选择工单");
      return;
    }
    try {
      await api("/piece-entries", {
        method: "POST",
        body: JSON.stringify({
          entry_date: form.entry_date,
          order_no: form.order_no || undefined,
          barcode: form.barcode || undefined,
          process_name: form.process_name,
          employee_id: Number(form.employee_id),
          quantity: Number(form.quantity),
        }),
      }, token);
      reset();
      onDone();
    } catch (err: any) {
      setError(err.message || "提交失败");
    }
  }

  function setError(msg: string) {
    // 行内提示用 form.suggestion 替代
    alert(msg);
  }

  return (
    <div className="grid">
      <section className="panel span-4">
        <div className="section-head">
          <h2><ScanLine size={18} /> 扫码报工</h2>
          <span className="status">支持扫码枪 + 手工</span>
        </div>
        <div className="form one">
          <Input label="日期" type="date" value={form.entry_date} onChange={(v) => setForm({ ...form, entry_date: v })} />
          <div className="field">
            <label>扫码 (条码)</label>
            <input
              ref={barcodeRef}
              autoFocus
              value={form.barcode}
              placeholder="扫码枪扫描, 或手动输入条码"
              onChange={(e) => setForm({ ...form, barcode: e.target.value.trim() })}
              onBlur={lookupBarcode}
              onKeyDown={(e) => { if (e.key === "Enter") lookupBarcode(); }}
            />
          </div>
          <div className="field">
            <label>或选工单</label>
            <select value={form.order_no} onChange={(e) => setForm({ ...form, order_no: e.target.value, barcode: "" })}>
              <option value="">请选择工单</option>
              {orders.filter((o) => o.status !== "已完成").map((o) => <option value={o.order_no} key={o.order_no}>{o.order_no} · {o.product_name}</option>)}
            </select>
          </div>
          {order ? (
            <div className="hint">
              当前工单：<strong>{order.product_name}</strong> · 已完成 {order.completed_quantity}/{order.quantity}
            </div>
          ) : (
            <div className="hint">请先扫条码或选择工单</div>
          )}
          <Select label="工序" value={form.process_name} onChange={(v) => setForm({ ...form, process_name: v })} options={processOptions} />
          <Select label="员工" value={form.employee_id} onChange={(v) => setForm({ ...form, employee_id: v })} options={employees.map((e) => [e.id, `${e.name} ${e.position}`])} />
          <div className="field">
            <label>数量</label>
            <input
              ref={qtyRef}
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          </div>
          <button className="primary" onClick={submit}><Save size={17} /> 录入</button>
        </div>
      </section>
      <Table title="计件记录 / 工资统计" rows={entries} cols={[["entry_date", "日期"], ["order_no", "工单"], ["process_name", "工序"], ["employee_name", "员工"], ["quantity", "数量"], ["unit_price", "单价"], ["wage", "工资"]]} span="span-8" />
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: any; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <div className="field"><label>{label}</label><input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>;
}

function Select({ label, value, onChange, options }: { label: string; value: any; onChange: (value: string) => void; options: any[][] }) {
  return <div className="field"><label>{label}</label><select value={value} onChange={(e) => onChange(e.target.value)}><option value="">请选择</option>{options.map(([v, t]) => <option value={v} key={v}>{t}</option>)}</select></div>;
}
