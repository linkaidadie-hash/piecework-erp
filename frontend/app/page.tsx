"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Boxes, ClipboardList, Factory, FileText, LogOut, Package, Printer, Save, Users } from "lucide-react";
import { api, money, Session } from "@/lib/api";

type Row = Record<string, any>;

const tabs = [
  ["dashboard", "看板", BarChart3],
  ["employees", "员工", Users],
  ["processes", "工序", Factory],
  ["products", "产品", Package],
  ["materials", "原料", Boxes],
  ["finished", "成品", Package],
  ["orders", "工单", ClipboardList],
  ["piece", "计件", FileText],
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
            <div>计件生产管理系统</div>
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
        {active === "employees" && <Crud title="员工管理" rows={data.employees as Row[]} token={session.token} path="/employees" fields={[["name", "姓名"], ["employee_no", "工号"], ["position", "岗位/工序"], ["piece_rate", "计件单价", "number"]]} onDone={refresh} />}
        {active === "processes" && <Crud title="岗位/工序管理" rows={data.processes as Row[]} token={session.token} path="/processes" fields={[["name", "工序名称"], ["default_price", "默认单价", "number"]]} onDone={refresh} />}
        {active === "products" && <Products rows={data.products as Row[]} processes={data.processes as Row[]} token={session.token} onDone={refresh} />}
        {active === "materials" && <Materials rows={data.materials as Row[]} token={session.token} onDone={refresh} />}
        {active === "finished" && <Finished rows={data.finished as Row[]} products={data.products as Row[]} token={session.token} onDone={refresh} />}
        {active === "orders" && <Orders rows={data.orders as Row[]} products={data.products as Row[]} materials={data.materials as Row[]} token={session.token} onDone={refresh} />}
        {active === "piece" && <Piece entries={data.entries as Row[]} employees={data.employees as Row[]} orders={data.orders as Row[]} token={session.token} onDone={refresh} />}
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [form, setForm] = useState({ company: "演示企业", username: "admin", password: "admin123456", auth_code: "DEMO-ERP-2026" });
  const [error, setError] = useState("");

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

  return (
    <div className="login">
      <div className="login-panel">
        <h1>计件生产管理系统</h1>
        <p className="hint">企业账号、授权码、设备绑定和到期停用已经接入。演示账号可直接登录。</p>
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

function Dashboard({ dashboard = {} }: { dashboard?: Row }) {
  const orders = (dashboard.work_orders || []) as Row[];
  return (
    <>
      <div className="section-head"><h2>手机老板看板</h2><span className="status">实时汇总</span></div>
      <div className="grid">
        <Metric label="今日产量" value={dashboard.today_quantity || 0} sub="按计件录入汇总" />
        <Metric label="今日工资" value={`¥ ${money(dashboard.today_wage)}`} sub="系统自动计算" />
        <Metric label="进行工单" value={orders.length} sub="生产进度追踪" />
        <Metric label="缺料提醒" value={(dashboard.low_materials || []).length} sub="低于安全库存" warn />
        <Table title="工单进度" rows={orders} cols={[["order_no", "工单号"], ["product_name", "产品"], ["quantity", "数量"], ["completed_quantity", "已完成"], ["status", "状态"]]} span="span-7" />
        <Table title="员工计件排名" rows={(dashboard.ranking || []) as Row[]} cols={[["employee_name", "员工"], ["quantity", "数量"], ["wage", "工资"]]} span="span-5" />
        <Table title="原材料库存" rows={(dashboard.materials || []) as Row[]} cols={[["name", "原料"], ["stock", "库存"], ["unit", "单位"], ["min_stock", "预警线"]]} span="span-7" />
        <Table title="成品库存" rows={(dashboard.finished_goods || []) as Row[]} cols={[["product_name", "产品"], ["spec", "规格"], ["stock", "库存"], ["unit", "单位"]]} span="span-5" />
      </div>
    </>
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
  const [form, setForm] = useState({ order_no: `WO-${Date.now().toString().slice(-6)}`, product_id: "", quantity: 100, material_id: "", material_qty: 0 });
  const product = products.find((p) => String(p.id) === String(form.product_id));
  async function submit() {
    await api("/work-orders", { method: "POST", body: JSON.stringify({ order_no: form.order_no, product_id: Number(form.product_id), quantity: Number(form.quantity), flow: product?.default_flow || [], materials: form.material_id ? [{ material_id: Number(form.material_id), quantity: Number(form.material_qty) }] : [] }) }, token);
    onDone();
  }
  return <div className="grid"><section className="panel span-4"><div className="section-head"><h2>工单录入</h2></div><div className="form one"><Input label="工单号" value={form.order_no} onChange={(v) => setForm({ ...form, order_no: v })} /><Select label="产品" value={form.product_id} onChange={(v) => setForm({ ...form, product_id: v })} options={products.map((p) => [p.id, `${p.name} ${p.spec}`])} /><Input label="生产数量" type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: Number(v) })} /><Select label="扣减原料" value={form.material_id} onChange={(v) => setForm({ ...form, material_id: v })} options={materials.map((m) => [m.id, m.name])} /><Input label="扣减数量" type="number" value={form.material_qty} onChange={(v) => setForm({ ...form, material_qty: Number(v) })} /><button className="primary" onClick={submit}><Save size={17} /> 开工</button></div></section><section className="panel span-8"><div className="section-head"><h2>工单列表</h2><button className="secondary" onClick={() => window.print()}><Printer size={17} /> 打印流程单</button></div><div className="print-sheet"><Table title="纸质流程单" rows={rows} cols={[["order_no", "工单号"], ["product_name", "产品"], ["quantity", "数量"], ["completed_quantity", "已完成"], ["status", "状态"]]} /><div className="signature-grid">{["裁剪", "车缝", "包装", "质检"].map((x) => <div key={x}>{x}<br />员工签名：</div>)}</div></div></section></div>;
}

function Piece({ entries = [], employees = [], orders = [], token, onDone }: { entries?: Row[]; employees?: Row[]; orders?: Row[]; token: string; onDone: () => void }) {
  const [form, setForm] = useState({ entry_date: new Date().toISOString().slice(0, 10), order_no: "", process_name: "", employee_id: "", quantity: 0 });
  const order = orders.find((o) => o.order_no === form.order_no);
  const processOptions = useMemo(() => (order?.flow || []).map((f: Row) => [f.name, `${f.name} ¥${f.price}`]), [order]);
  async function submit() {
    await api("/piece-entries", { method: "POST", body: JSON.stringify({ ...form, employee_id: Number(form.employee_id), quantity: Number(form.quantity) }) }, token);
    onDone();
  }
  return <div className="grid"><section className="panel span-4"><div className="section-head"><h2>每日计件录入</h2></div><div className="form one"><Input label="日期" type="date" value={form.entry_date} onChange={(v) => setForm({ ...form, entry_date: v })} /><Select label="工单号" value={form.order_no} onChange={(v) => setForm({ ...form, order_no: v, process_name: "" })} options={orders.map((o) => [o.order_no, o.order_no])} /><Select label="工序" value={form.process_name} onChange={(v) => setForm({ ...form, process_name: v })} options={processOptions} /><Select label="员工" value={form.employee_id} onChange={(v) => setForm({ ...form, employee_id: v })} options={employees.map((e) => [e.id, `${e.name} ${e.position}`])} /><Input label="数量" type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: Number(v) })} /><button className="primary" onClick={submit}><Save size={17} /> 录入</button></div></section><Table title="计件记录 / 工资统计" rows={entries} cols={[["entry_date", "日期"], ["order_no", "工单"], ["process_name", "工序"], ["employee_name", "员工"], ["quantity", "数量"], ["unit_price", "单价"], ["wage", "工资"]]} span="span-8" /></div>;
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: any; onChange: (value: string) => void; type?: string }) {
  return <div className="field"><label>{label}</label><input type={type} value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}

function Select({ label, value, onChange, options }: { label: string; value: any; onChange: (value: string) => void; options: any[][] }) {
  return <div className="field"><label>{label}</label><select value={value} onChange={(e) => onChange(e.target.value)}><option value="">请选择</option>{options.map(([v, t]) => <option value={v} key={v}>{t}</option>)}</select></div>;
}
