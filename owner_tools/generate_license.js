const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIKpiGY+44hXuomtEnljViXb9EDD//tEJMWtGv9sxzVBo
-----END PRIVATE KEY-----`;

const signedFields = ["customerName", "licenseCode", "machineId", "edition", "expireAt", "maxUsers", "issuedAt"];

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

function canonicalPayload(license) {
  const payload = {};
  for (const field of signedFields) payload[field] = license[field] ?? null;
  return JSON.stringify(payload, Object.keys(payload).sort());
}

const args = parseArgs(process.argv);
if (!args.customer || !args.machine) {
  console.error("用法: node owner_tools/generate_license.js --customer 某某工厂 --machine MID-v1.xxx [--out license.dat]");
  process.exit(1);
}

const license = {
  customerName: args.customer,
  licenseCode: args.code || randomCode(),
  machineId: args.machine,
  edition: args.edition || "standard",
  expireAt: args.expire || "2099-12-31",
  maxUsers: Number(args.maxUsers || 1),
  issuedAt: args.issuedAt || today(),
};

license.signature = crypto.sign(null, Buffer.from(canonicalPayload(license), "utf8"), PRIVATE_KEY).toString("base64");

const out = path.resolve(args.out || "license.dat");
fs.writeFileSync(out, JSON.stringify(license, null, 2), "utf8");
console.log(`已生成授权文件: ${out}`);
console.log(`客户: ${license.customerName}`);
console.log(`授权码: ${license.licenseCode}`);
