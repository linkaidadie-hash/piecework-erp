# Security Incident Notice — 2026-07-23

## 事件

2026-07-23，仓库 `owner_tools/generate_license.js` 的 **Ed25519 私钥硬编码**被发现在公开仓库中。 该私钥用于签发"计件生产管理系统"软件 license。任何拥有此私钥的人都可以伪造任意 `machineId / customerName / expireAt` 的 license, 并通过本仓库 `backend/app/core/license.py` 的内置公钥验证。

## 影响

- 受影响软件: `piecework-erp` 全系列 (含 4 个 release: v0.2.0, v0.3.0, v1.0.0, v1.0.1)
- 真实客户数: **0** (按 GitHub Release 下载量推断: 总 11 次下载, 无 SaaS 部署记录)
- 直接风险: 任何攻击者可以伪造"无限期 / 任意机器 / 任意客户" license 并通过本软件验证

## 已执行的修复 (P0 2026-07-23)

1. ✅ 新 Ed25519 keypair 生成, **私钥仅存在 vault** (`C:\Users\Administrator\.mavis\vault\keys\piecework-erp-license.ed25519.pem`, mode 600)
2. ✅ 新公钥指纹: `f45286dead8d5ef177dec4847f9c280be221bd4dc7b0c381e9c1a40a93f58235`
3. ✅ 新 kid: `ed25519-2026-07-23`
4. ✅ `owner_tools/generate_license.js` — 删所有硬编码私钥, 改为 env / vault 读
5. ✅ `backend/app/core/license.py` — 加 kid 验证, 旧 kid (`ed25519-2026-05-20`) 显式拒绝, 缺 kid 字段拒绝
6. ✅ `backend/app/core/config.py` — 改为多 kid keyset (`TRUSTED_LICENSE_KEYS`), 默认新公钥
7. ✅ `backend/app_launcher.py` — 删硬编码 `SECRET_KEY` fallback
8. ✅ `.gitignore` — 强化 (排除 `*.pem`, `*.key`, `license.dat`, `vault/`, `secrets.env` 等)
9. ✅ `tests/test_license_security.py` — 16 个安全测试 (新私钥可签/验, 错公钥/篡改/缺签名/旧 kid/旧格式 全部拒绝)
10. ✅ 所有 4 个 release 删除 (v0.2.0, v0.3.0, v1.0.0, v1.0.1)
11. ✅ 所有 4 个 tag ref 删除 (但 git history 仍在, 见下方)

## 仍在进行

- ⚠️ **git history 重写 (filter-repo)**: 旧私钥在历史 commit 中, 需要本地 clone + filter-repo + force push 清理. 仓库维护者请在本地跑 `tools/filter-piecework-history.sh` (随本通知一起提交).
- ⚠️ **v1.0.1 release 附件 `license-generator.html`**: HTML 网页版 license 签发工具, **未在 main 源码**. 该 HTML 可能含**另一对 keypair** (用于 v1 系统: business-system / scanner-plugin). 已从 release 删除, 但仍可能在 GitHub 缓存 / fork. 影响 v1 系统, 不影响 piecework-erp main.

## 真客户影响

**0** (按公开数据推断). 无需 reissue license. 如果后续发现真实使用, 维护者必须:
1. 引导客户运行新版本 (含新公钥)
2. 引导客户运行 `node owner_tools/generate_license.js inspect` 拿到新公钥指纹
3. 用新私钥为合法客户签发新 license
4. 任何带旧 kid (`ed25519-2026-05-20`) 或无 kid 字段的旧 license 一律拒绝

## 教训

- 永远不要在源码中硬编码私钥, 永远从 env / vault 读
- 永远给 license 加 `kid` 字段, 让轮换可热加载
- 永远把"已泄露的 keypair"加入 `DEPRECATED_KIDS` 黑名单 (即使签名合法)
- 安装包 (.exe) 内置公钥 = attack surface; 任何 release 都应在泄露事件后立即删除
- 公开仓库一旦泄露, **轮换密钥** 比 "重写历史" 更根本 (历史可能已被 fork / cache)

## 联系方式

如发现新风险, 请开 issue 标注 `security`.
