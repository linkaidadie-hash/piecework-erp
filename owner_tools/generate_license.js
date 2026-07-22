// owner_tools/generate_license.js — 签发 Ed25519 license (kid 化)
//
// 关键安全约束（user 2026-07-23 安全事件响应 P0）：
//   - 私钥绝不在仓库, 绝不在终端, 绝不在日志, 绝不在 commit, 绝不在 patch/test/build artifact
//   - 私钥只从以下来源读取 (按优先级):
//       1) $PIECEWORK_LICENSE_SIGNING_KEY  (PEM string)
//       2) $PIECEWORK_LICENSE_SIGNING_KEY_FILE  (path to PEM file)
//       3) vault  [PIECEWORK_LICENSE].signing_key  (via $MAVIS_VAULT_PATH)
//   - 缺私钥时立即 fail, 不允许生成临时 key / 回退旧 key / 任何"演示模式"
//   - 日志只显示 kid, license code, key fingerprint (短), 结果
//   - license JSON 强制带 kid, 验签端按 kid 找公钥
//
// 用法 (sign):
//   node owner_tools/generate_license.js sign \
//     --product sme-production-system --customer 某某工厂 --machine MID-v1.xxx \
//     [--out license.dat]
//
// 缺私钥:
//   $ node owner_tools/generate_license.js sign --product x --customer y --machine z
//   [FATAL] no signing key available
//   exit 1

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// === 签名 key 来源 (按优先级) ===
function readKeyFromEnv() {
  if (process.env.PIECEWORK_LICENSE_SIGNING_KEY) {
    return { source: 'env:PIECEWORK_LICENSE_SIGNING_KEY', key: process.env.PIECEWORK_LICENSE_SIGNING_KEY };
  }
  if (process.env.PIECEWORK_LICENSE_SIGNING_KEY_FILE) {
    const p = process.env.PIECEWORK_LICENSE_SIGNING_KEY_FILE;
    if (!fs.existsSync(p)) throw new Error(`PIECEWORK_LICENSE_SIGNING_KEY_FILE points to missing file`);
    return { source: `file:${p}`, key: fs.readFileSync(p, 'utf8') };
  }
  return null;
}

function readKeyFromVault() {
  const vp = process.env.MAVIS_VAULT_PATH || (process.platform === 'win32'
    ? path.join(process.env.USERPROFILE || process.env.HOME || '', '.mavis', 'vault', 'secrets.env')
    : path.join(process.env.HOME || '', '.mavis', 'vault', 'secrets.env'));
  if (!fs.existsSync(vp)) return null;
  const text = fs.readFileSync(vp, 'utf8');
  const sec = {};
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) { cur = line.slice(1, -1); sec[cur] = sec[cur] || {}; continue; }
    if (cur && line.includes('=')) {
      const i = line.indexOf('=');
      sec[cur][line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const sec2 = sec.PIECEWORK_LICENSE;
  if (!sec2?.signing_key) return null;
  return { source: `vault:PIECEWORK_LICENSE.signing_key@${vp}`, key: sec2.signing_key };
}

function loadSigningKey() {
  const r1 = readKeyFromEnv();
  if (r1) return r1;
  const r2 = readKeyFromVault();
  if (r2) return r2;
  // 不允许任何回退: 缺私钥 = 立即 fail
  console.error('[FATAL] no signing key available. Set one of:');
  console.error('  - $PIECEWORK_LICENSE_SIGNING_KEY  (PEM string)');
  console.error('  - $PIECEWORK_LICENSE_SIGNING_KEY_FILE  (path to PEM file)');
  console.error('  - $MAVIS_VAULT_PATH  with [PIECEWORK_LICENSE].signing_key');
  process.exit(2);
}

// 解析 PEM 私钥, 提取 kid + public key
function parsePrivateKey(pem) {
  let k;
  try {
    k = crypto.createPrivateKey(pem);
  } catch (e) {
    throw new Error(`failed to parse private key: ${e?.message || e}`);
  }
  if (k.asymmetricKeyType !== 'ed25519') {
    throw new Error(`expected ed25519, got ${k.asymmetricKeyType}`);
  }
  const pubKey = crypto.createPublicKey(k);
  // kid = sha256(public_key_DER)[:16 hex]
  const pubDer = pubKey.export({ type: 'spki', format: 'der' });
  const fp = crypto.createHash('sha256').update(pubDer).digest('hex');
  return { privateKey: k, publicKey: pubKey, kid: `ed25519-${fp.slice(0, 16)}`, fingerprint: fp };
}

const PRODUCTS = {
  "business-system": "商贸管账系统",
  "sme-production-system": "中小企业生产系统",
  "ai-live-system": "AI直播系统",
};

const SIGNED_FIELDS = [
  "kid",
  "vendorId",
  "productId",
  "productName",
  "customerName",
  "licenseCode",
  "machineId",
  "edition",
  "expireAt",
  "maxUsers",
  "issuedAt",
];

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function randomCode() {
  const ymd = today().replaceAll("-", "");
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `LIC-${ymd}-${suffix}`;
}

function sign(argv) {
  const args = parseArgs(argv);
  const cmd = args._cmd || (argv[2] === 'sign' ? 'sign' : 'inspect');
  if (cmd === 'inspect') {
    // 仅返回当前公钥 + kid, 不签名, 不暴露私钥
    const src = loadSigningKey();
    const k = parsePrivateKey(src.key);
    console.log(JSON.stringify({ kid: k.kid, fingerprint: k.fingerprint, source: src.source }, null, 2));
    return;
  }
  if (cmd !== 'sign') {
    console.error('用法: node generate_license.js sign --product <id> --customer <name> --machine <MID>');
    console.error('     node generate_license.js inspect    (仅输出公钥 + kid, 不签名)');
    process.exit(1);
  }

  const productId = args.product || "sme-production-system";
  const productName = PRODUCTS[productId];
  if (!productName || !args.customer || !args.machine) {
    console.error('用法: node owner_tools/generate_license.js sign --product sme-production-system --customer 某某工厂 --machine MID-v1.xxx [--out license.dat]');
    process.exit(1);
  }

  const src = loadSigningKey();
  const k = parsePrivateKey(src.key);
  // 立刻清空 src 引用 (虽然 GC 不会清, 但展示良好习惯)
  src.key = '[redacted]';

  const license = {
    kid: k.kid,
    vendorId: "yinmi",
    productId,
    productName,
    customerName: args.customer,
    licenseCode: args.code || randomCode(),
    machineId: args.machine,
    edition: args.edition || "standard",
    expireAt: args.expire || "2099-12-31",
    maxUsers: Number(args.maxUsers || 1),
    issuedAt: args.issuedAt || today(),
  };

  // 签名只覆盖 SIGNED_FIELDS 的子集
  const signedSubset = {};
  for (const f of SIGNED_FIELDS) signedSubset[f] = license[f];
  const canonical = Buffer.from(canonicalize(signedSubset), "utf8");
  // Ed25519 私钥签名: null 表示数据本身即 digest (Ed25519 规范)
  license.signature = crypto.sign(null, canonical, k.privateKey).toString("base64");

  // 同时存公钥 (验签端优先用 kid 查, 但 license 自带公钥可作为 fallback / 离线验证)
  license.publicKey = k.publicKey.export({ type: 'spki', format: 'pem' });

  const out = path.resolve(args.out || "license.dat");
  fs.writeFileSync(out, JSON.stringify(license, null, 2), "utf8");

  // 日志: kid + 短指纹 + license code + 结果, 绝不出私钥
  console.log(`[ok] license signed`);
  console.log(`  kid: ${k.kid}`);
  console.log(`  fingerprint: ${k.fingerprint.slice(0, 16)}...`);
  console.log(`  product: ${license.productName} (${license.productId})`);
  console.log(`  customer: ${license.customerName}`);
  console.log(`  licenseCode: ${license.licenseCode}`);
  console.log(`  machineId: ${license.machineId}`);
  console.log(`  expireAt: ${license.expireAt}`);
  console.log(`  edition: ${license.edition} / maxUsers: ${license.maxUsers}`);
  console.log(`  source: ${src.source}`);
  console.log(`  output: ${out}`);
}

sign(process.argv);
