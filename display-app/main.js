import { app, BrowserWindow, ipcMain, globalShortcut, session } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import Store from "electron-store";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store({ name: "pairing" });

let kioskWindow = null;
let pairingWindow = null;

function createPairingWindow() {
  if (pairingWindow) {
    pairingWindow.focus();
    return;
  }
  pairingWindow = new BrowserWindow({
    width: 480,
    height: 280,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  pairingWindow.loadFile(path.join(__dirname, "pairing.html"));
  pairingWindow.on("closed", () => {
    pairingWindow = null;
  });
}

function createKioskWindow(url) {
  kioskWindow?.close();
  kioskWindow = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  kioskWindow.loadURL(url);
  kioskWindow.on("closed", () => {
    kioskWindow = null;
  });
}

ipcMain.handle("pairing-get", () => store.get("url") || "");

ipcMain.handle("pairing-save", (event, url) => {
  store.set("url", url);
  pairingWindow?.close();
  createKioskWindow(url);
  return true;
});

app.whenReady().then(() => {
  // ngrok's free-tier domains show a "you are about to visit..." click-through
  // page to any request that doesn't carry this header — without it, both the
  // initial page load and the page's own /state polling would hit that
  // interstitial instead of the real display screen, every single launch.
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders["ngrok-skip-browser-warning"] = "true";
    callback({ requestHeaders: details.requestHeaders });
  });

  const url = store.get("url");
  if (url) {
    createKioskWindow(url);
  } else {
    createPairingWindow();
  }

  app.setLoginItemSettings({ openAtLogin: true });

  // Re-pairing shortcut for when the tunnel URL changes (e.g. no ngrok
  // static domain configured on the main app, so the address changes on
  // every restart there).
  globalShortcut.register("CommandOrControl+Shift+P", () => {
    createPairingWindow();
  });
});

// This is a kiosk device meant to run unattended in the background — don't
// let closing the pairing window (or the kiosk window, if ever closed)
// quit the app, since that would also drop the re-pair shortcut.
app.on("window-all-closed", () => {});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
