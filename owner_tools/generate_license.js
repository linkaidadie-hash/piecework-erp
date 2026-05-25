const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIIn5VD9m9jWPT4h5BLycev/uRKPFCy5Unamys5hZU+9Y
-----END PRIVATE KEY-----`;

const PRODUCTS = {
  "business-system": "商贸管账系统",
  "sme-production-system": "中小企业生产系统",
  "ai-live-system": "AI直播系统",
};

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

const args = parseArgs(process.argv);
const productId = args.product || "sme-production-system";
const productName = PRODUCTS[productId];
if (!productName || !args.customer || !args.machine) {
  console.error("用法: node owner_tools/generate_license.js --product sme-production-system --customer 某某工厂 --machine MID-v1.xxx [--out license.dat]");
  process.exit(1);
}

const license = {
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

license.signature = crypto.sign(null, Buffer.from(canonicalize(license), "utf8"), PRIVATE_KEY).toString("base64");

const out = path.resolve(args.out || "license.dat");
fs.writeFileSync(out, JSON.stringify(license, null, 2), "utf8");
console.log(`已生成授权文件: ${out}`);
console.log(`产品: ${license.productName}`);
console.log(`客户: ${license.customerName}`);
console.log(`授权码: ${license.licenseCode}`);
