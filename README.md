# 中小企业生产系统

系统包含登录、员工管理、岗位/工序、产品、原料库存、成品库存、工单录入、流程单打印、每日计件录入、工资统计、手机老板看板和离线买断版授权校验。

## 离线授权流程

客户软件只内置公钥，不能生成授权文件。正式销售流程：

```text
客户安装软件
客户在授权管理页复制机器码
销售方使用老板端授权生成器生成 license.dat
客户导入 license.dat
授权验证通过后才能登录和使用系统
```

老板端授权生成器不打包进客户软件，位于 `owner_tools/generate_license.js`：

```powershell
node owner_tools/generate_license.js --customer 某某工厂 --machine MID-v1.xxx --out license.dat
```

授权文件包含客户名称、授权码、机器码、版本、有效期、用户数、签发日期和 Ed25519 私钥签名。客户软件只验证签名和机器绑定，不保存私钥。

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

演示登录信息。首次登录前需要先导入有效 `license.dat`：

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
