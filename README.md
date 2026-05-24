# 计件生产管理系统 MVP

第一版已经包含登录、员工管理、岗位/工序、产品、原料库存、成品库存、工单录入、流程单打印、每日计件录入、工资统计、手机老板看板和 SaaS 授权校验骨架。

## 本地开发

后端默认用 SQLite，方便开发演示：

```powershell
cd backend
python -m venv .venv
.\\.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

前端：

```powershell
cd frontend
npm install
npm run dev
```

演示登录信息：

- 企业：`演示企业`
- 账号：`admin`
- 密码：`admin123456`
- 授权码：`DEMO-ERP-2026`

## VPS 部署

建议域名先解析：

- 记录类型：`A`
- 主机记录：`erp`
- 记录值：`109.199.122.37`

服务器安装 Docker 和 Compose 后，把代码放到 VPS，复制环境变量：

```bash
cp .env.example .env
docker compose up -d --build
```

服务启动后访问：

- `http://erp.hanshuniu.top`
- `http://109.199.122.37`

生产 HTTPS 建议再接 Certbot 或把 Nginx 放到已有 HTTPS 网关后面。
