const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const BACKEND_PORT = 18765;
const FRONTEND_PORT = 18766;

let backendProcess;
let staticServer;
let frontendPort = FRONTEND_PORT;

function userPath(...segments) {
  return path.join(app.getPath("userData"), ...segments);
}

function ensureSecretKey() {
  const file = userPath("secret.key");
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, crypto.randomBytes(48).toString("hex"), "utf8");
  }
  return fs.readFileSync(file, "utf8").trim();
}

function resourcePath(...segments) {
  if (app.isPackaged) return path.join(process.resourcesPath, ...segments);
  return path.join(__dirname, "..", ...segments);
}

function startBackend() {
  const exe = app.isPackaged
    ? resourcePath("backend", "sme-production-backend.exe")
    : process.env.DESKTOP_BACKEND_EXE;

  if (!exe || !fs.existsSync(exe)) {
    throw new Error("未找到本地后端程序");
  }

  const dataDir = userPath("data");
  const logsDir = userPath("logs");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  const log = fs.openSync(path.join(logsDir, "backend.log"), "a");
  backendProcess = spawn(exe, [], {
    env: {
      ...process.env,
      DESKTOP_BACKEND_PORT: String(BACKEND_PORT),
      DATABASE_URL: `sqlite:///${path.join(dataDir, "production.db").replace(/\\/g, "/")}`,
      LICENSE_FILE: path.join(dataDir, "license.dat"),
      SECRET_KEY: ensureSecretKey(),
      DEFAULT_DOMAIN: "localhost",
    },
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
}

function isBackendRunning() {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
      res.resume();
      resolve(true);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(800, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

function startStaticServer() {
  const root = app.isPackaged ? resourcePath("frontend") : path.join(__dirname, "..", "frontend", "out");
  staticServer = http.createServer((request, response) => {
    const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
    const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
    let filePath = path.join(root, safePath === "/" ? "index.html" : safePath);
    if (!filePath.startsWith(root)) filePath = path.join(root, "index.html");
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(root, "index.html");
    response.setHeader("Content-Type", contentType(filePath));
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve, reject) => {
    staticServer.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        staticServer.listen(0, "127.0.0.1");
        return;
      }
      reject(error);
    });
    staticServer.on("listening", () => {
      frontendPort = staticServer.address().port;
      resolve();
    });
    staticServer.listen(FRONTEND_PORT, "127.0.0.1");
  });
}

function waitForBackend() {
  const deadline = Date.now() + 20000;
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
        res.resume();
        resolve();
      }).on("error", () => {
        if (Date.now() > deadline) reject(new Error("本地服务启动超时"));
        else setTimeout(check, 500);
      });
    };
    check();
  });
}

async function createWindow() {
  if (!(await isBackendRunning())) startBackend();
  await startStaticServer();
  await waitForBackend();

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: "中小企业生产系统",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadURL(`http://127.0.0.1:${frontendPort}`);
}

app.whenReady().then(createWindow).catch((error) => {
  dialog.showErrorBox("中小企业生产系统启动失败", error.message);
  app.quit();
});

app.on("window-all-closed", () => app.quit());

app.on("before-quit", () => {
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
  if (staticServer) staticServer.close();
});
