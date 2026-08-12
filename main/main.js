import { app, BrowserWindow, ipcMain, session, dialog } from "electron";
import serve from "electron-serve";
import path from "path";
import fs from "fs";
import http from "http";
import os from "os";
import crypto from "crypto";
import Store from "electron-store";
import { Tunnel, use as useCloudflaredBin } from "cloudflared";
import electronUpdaterPkg from "electron-updater";
const { autoUpdater } = electronUpdaterPkg;

const isDev = process.env.NODE_ENV !== "production";

// Manual, button-driven updates: checks/downloads/installs only happen when
// the renderer's "Check for Updates" page asks for them (see the ipcMain
// handlers below), never automatically on launch. This keeps update
// notifications tied to an explicit GitHub Release we publish, not to every
// commit/local test build — see registerAutoUpdater's callers.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function registerAutoUpdater() {
  autoUpdater.on("checking-for-update", () => {
    mainWindow?.webContents.send("update:status", { state: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("update:status", {
      state: "available",
      version: info.version,
    });
  });
  autoUpdater.on("update-not-available", () => {
    mainWindow?.webContents.send("update:status", { state: "not-available" });
  });
  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update:status", {
      state: "downloading",
      percent: Math.round(progress.percent),
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    mainWindow?.webContents.send("update:status", {
      state: "downloaded",
      version: info.version,
    });
  });
  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("update:status", {
      state: "error",
      message: err?.message || String(err),
    });
  });
}

ipcMain.handle("update-check", async () => {
  if (isDev || !app.isPackaged) {
    return { error: "Update check is only available in the installed app, not in dev mode." };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    return { error: err?.message || String(err) };
  }
});

ipcMain.on("update-download", () => {
  autoUpdater.downloadUpdate();
});

ipcMain.on("update-install", () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle("get-app-version", () => app.getVersion());

// Serve the exported Next.js files in production
const loadURL = serve({
  directory: "app",
});

let mainWindow;

// Customer-facing payment display: a second device (tablet, spare phone,
// small monitor+PC) points its browser at a URL served by this machine and
// shows nothing but the current payment QR / thank-you screen. Preferably a
// Cloudflare tunnel URL (see startDisplayTunnel below), which works no
// matter how the two devices' networks are set up; getDisplayBaseUrl's LAN
// IP is only a fallback for when the tunnel can't be reached. The page is
// inlined here (rather than a separate .html file) so it's guaranteed to
// ship with main.js regardless of how nextron bundles the main process.
const DISPLAY_PORT = 4321;
let displayState = { status: "idle" };
let displayResetTimer = null;

// Shared secret the display device must present (as ?token=) to read the
// display server. Without this, anyone on the same LAN who guessed the IP
// could open it directly. Generated once and persisted so it survives restarts —
// otherwise every restart would invalidate whatever was paired into the
// Display app. Initialized in app.whenReady() below since electron-store
// resolves app.getPath('userData') internally.
let displayToken = null;

// A phone hotspot's NAT frequently won't route LAN traffic between the
// devices connected to it (or even back to the phone itself), so the
// display device often can't reach getDisplayBaseUrl()'s LAN IP at all.
// A Cloudflare quick tunnel gives every device a normal public HTTPS URL
// instead, sidestepping that entirely — deliberately not a named/fixed
// domain, since that would require moving this org's real website+email
// domain onto Cloudflare DNS, which isn't worth the risk for what's just an
// internal counter display. The tradeoff: the URL is random and changes on
// every app restart, so the display device needs re-pairing (Ctrl+Shift+P
// on the kiosk app, or just re-opening the new link) whenever that happens.
let resolveTunnelReady;
const tunnelReady = new Promise((resolve) => {
  resolveTunnelReady = resolve;
});

function startDisplayTunnel() {
  try {
    // nextron bundles main.js's requires into one file, so cloudflared's
    // own __dirname-relative lookup of its binary (constants.js) resolves
    // to the wrong folder once packaged. process.resourcesPath is a real
    // Electron runtime API, not a bundle-time constant, so it still points
    // at the right place — the binary is shipped there via the "extraResources"
    // entry in package.json's build config.
    if (app.isPackaged) {
      useCloudflaredBin(
        path.join(
          process.resourcesPath,
          "cloudflared-bin",
          process.platform === "win32" ? "cloudflared.exe" : "cloudflared"
        )
      );
    }
    const tunnel = Tunnel.quick(`http://localhost:${DISPLAY_PORT}`);
    tunnel.once("url", (url) => {
      resolveTunnelReady(url);
    });
    tunnel.on("error", (err) => {
      console.error("[display-tunnel] error:", err);
      resolveTunnelReady(null);
    });
  } catch (err) {
    console.error("[display-tunnel] failed to start:", err);
    resolveTunnelReady(null);
  }
}

function initDisplayToken() {
  const authStore = new Store({ name: "display-auth" });
  displayToken = authStore.get("token");
  if (!displayToken) {
    displayToken = crypto.randomBytes(16).toString("hex");
    authStore.set("token", displayToken);
  }
}

const CUSTOMER_DISPLAY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Swami Samarth Math — Payment</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    height: 100%;
    font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    background: #0f172a;
    color: #f1f5f9;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  #screen { text-align: center; padding: 32px; width: 100%; max-width: 520px; }
  h1 { font-size: 22px; font-weight: 600; margin-bottom: 8px; }
  p { font-size: 15px; color: #94a3b8; }
  #qr-img {
    width: min(70vw, 360px); height: min(70vw, 360px);
    background: #fff; border-radius: 12px; padding: 16px;
    margin: 20px auto; display: block;
  }
  #amount { font-size: 32px; font-weight: 700; color: #fbbf24; margin-top: 8px; }
  #success-icon { font-size: 72px; margin-bottom: 12px; }
  .hidden { display: none; }
</style>
</head>
<body>
  <div id="screen">
    <div id="state-idle">
      <h1>स्वामी समर्थ मठ</h1>
      <p>Please wait for the cashier to start your payment...</p>
    </div>
    <div id="state-qr" class="hidden">
      <h1>Scan &amp; Pay</h1>
      <p>Scan this QR code with any UPI app to pay</p>
      <img id="qr-img" alt="Payment QR code" />
      <div id="amount"></div>
    </div>
    <div id="state-success" class="hidden">
      <div id="success-icon">✅</div>
      <h1>Payment Received</h1>
      <p id="success-amount"></p>
    </div>
  </div>
  <script>
    const idleEl = document.getElementById("state-idle");
    const qrEl = document.getElementById("state-qr");
    const successEl = document.getElementById("state-success");
    const qrImg = document.getElementById("qr-img");
    const amountEl = document.getElementById("amount");
    const successAmountEl = document.getElementById("success-amount");
    let lastStatus = null;

    function showOnly(el) {
      [idleEl, qrEl, successEl].forEach((e) => e.classList.add("hidden"));
      el.classList.remove("hidden");
    }

    function render(state) {
      if (state.status === lastStatus && state.status !== "qr") return;
      lastStatus = state.status;
      if (state.status === "qr") {
        qrImg.src = state.qrDataUrl || "";
        amountEl.textContent = state.amount ? "₹" + state.amount : "";
        showOnly(qrEl);
      } else if (state.status === "success") {
        successAmountEl.textContent = state.amount ? "₹" + state.amount + " received. Thank you!" : "Thank you!";
        showOnly(successEl);
      } else {
        showOnly(idleEl);
      }
    }

    async function poll() {
      try {
        const res = await fetch("/state" + window.location.search);
        render(await res.json());
      } catch (err) {
        // network hiccup — keep last screen, try again next tick
      } finally {
        setTimeout(poll, 1000);
      }
    }
    poll();
  </script>
</body>
</html>`;

function startDisplayServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${DISPLAY_PORT}`);
    if (url.searchParams.get("token") !== displayToken) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }
    if (url.pathname === "/state") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(displayState));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(CUSTOMER_DISPLAY_HTML);
  });
  server.on("error", (err) => console.error("[display-server] failed to start:", err));
  server.listen(DISPLAY_PORT, "0.0.0.0");
}

async function getDisplayUrl() {
  const base = await Promise.race([
    tunnelReady,
    new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
  ]);
  return `${base || getDisplayBaseUrl()}?token=${displayToken}`;
}

// Fallback for when the tunnel isn't reachable (e.g. no internet at the
// counter). Requires the display device to be on the same local network as
// this PC (same Wi-Fi/router, no AP/client isolation) — most phone hotspots
// don't satisfy this. See getDisplayUrl's callers for where this is
// surfaced to staff.
function getDisplayBaseUrl() {
  const nets = os.networkInterfaces();
  for (const ifaceList of Object.values(nets)) {
    for (const net of ifaceList) {
      if (net.family === "IPv4" && !net.internal) {
        return `http://${net.address}:${DISPLAY_PORT}`;
      }
    }
  }
  return `http://localhost:${DISPLAY_PORT}`;
}

ipcMain.on("display-show-qr", (event, payload) => {
  clearTimeout(displayResetTimer);
  displayState = { status: "qr", ...payload };
});

ipcMain.on("display-payment-success", (event, payload) => {
  clearTimeout(displayResetTimer);
  displayState = { status: "success", ...payload };
  displayResetTimer = setTimeout(() => {
    displayState = { status: "idle" };
  }, 8000);
});

ipcMain.on("display-reset", () => {
  clearTimeout(displayResetTimer);
  displayState = { status: "idle" };
});

ipcMain.handle("get-display-url", () => getDisplayUrl());

async function createWindow() {
  // Inject CORS headers for all Wix backend requests, and for the SMS
  // gateway (which doesn't return CORS headers on its own).
  // Also force status 200 on OPTIONS preflight so the browser accepts it
  // even when Wix returns 404/405 for endpoints without an OPTIONS handler.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: [
      "https://www.swamisamarthmathbhuigaon.com/_functions/*",
      "https://textsms.thetechmore.in/*",
    ] },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "access-control-allow-origin":  ["*"],
          "access-control-allow-methods": ["GET, POST, PUT, DELETE, OPTIONS"],
          "access-control-allow-headers": ["Content-Type, Authorization"],
        },
        statusLine: details.method === "OPTIONS" ? "HTTP/1.1 200 OK" : details.statusLine,
      });
    }
  );

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: false,
    webPreferences: {
      // nextron always emits main.js and preload.js into the same "app"
      // output folder (see webpack.config.cjs), both in dev and once
      // packaged into app.asar. app.getAppPath() is resolved by Electron at
      // runtime, unlike a __dirname derived from import.meta.url — webpack's
      // ESM output (package.json has "type": "module") bakes import.meta.url
      // in as a build-time string literal of the source file's path on the
      // machine that ran the build, which breaks on every other machine.
      preload: path.join(app.getAppPath(), "app", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    // Mirrors the renderer's DevTools console into this process's stdout —
    // without this, console.log calls from React code only ever show up in
    // the DevTools panel itself, invisible to anyone just watching the
    // terminal `npm run dev` was launched from (or a redirected log file).
    mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
      const file = String(sourceId || "").split(/[\\/]/).pop();
      console.log(`[renderer] ${file}:${line} ${message}`);
    });

    await mainWindow.loadURL("http://localhost:8888");
    mainWindow.webContents.openDevTools();
    // Restore focus to main window after DevTools opens
    mainWindow.webContents.once("devtools-opened", () => {
      mainWindow.webContents.focus();
    });
  } else {
    await loadURL(mainWindow);
  }
}

ipcMain.on("print-receipt", (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.webContents.print(
    {
      silent: false,
      printBackground: true,
      pageSize: { width: 185000, height: 125000 },
    },
    (success, errorType) => {
      if (!success) console.error("Print failed:", errorType);
    }
  );
});

ipcMain.handle("generate-receipt-pdf", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: { width: 185000, height: 125000 },
  });

  // DEBUG: dump the generated PDF to disk so it can be verified independently
  // of whether the Wix /upload_receipt endpoint is reachable.
  if (isDev) {
    const debugPath = path.join(app.getPath("desktop"), "debug-receipt.pdf");
    try {
      fs.writeFileSync(debugPath, pdfBuffer);
      console.log(`[generate-receipt-pdf] wrote ${pdfBuffer.length} bytes to ${debugPath}`);
    } catch (err) {
      console.error("[generate-receipt-pdf] failed to write debug PDF:", err);
    }
  }

  return pdfBuffer.toString("base64");
});

ipcMain.handle("save-csv-report", async (event, { filename, content }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: filename,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (canceled || !filePath) return { success: false, canceled: true };

  const BOM = "﻿";
  try {
    fs.writeFileSync(filePath, BOM + content, "utf8");
  } catch (err) {
    if (err.code === "EBUSY" || err.code === "EPERM") {
      return {
        success: false,
        error: "The file is open in another program (e.g. Excel). Close it and try again.",
      };
    }
    return { success: false, error: err.message };
  }
  return { success: true, filePath };
});

app.whenReady().then(() => {
  initDisplayToken();
  registerAutoUpdater();
  createWindow();
  startDisplayServer();
  startDisplayTunnel();
});

app.on("window-all-closed", async () => {
  // Force any pending localStorage/session writes to disk before quitting.
  // Without this, data saved just before closing (e.g. login token) can be
  // lost since Chromium writes localStorage to disk asynchronously.
  try {
    await session.defaultSession.flushStorageData();
  } catch (err) {
    console.error("flushStorageData error:", err);
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});