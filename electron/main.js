// Debate AI desktop shell. Serves the production Next.js build on a
// loopback port and opens it in a window — no system Node needed.
//   Dev:  npm run dev  (terminal 1) + ELECTRON_DEV=1 npx electron . (terminal 2)
//   Node smoke (no GUI): node electron/main.js --smoke
"use strict";

const http = require("http");
const path = require("path");

const isDev = process.env.ELECTRON_DEV === "1";
const isSmokerun = process.argv.includes("--smoke");

async function startProdServer(dir) {
  // Runs inside Electron (bundled Node) or plain Node for --smoke.
  const next = require("next");
  const app = next({ dev: false, dir });
  const handle = app.getRequestHandler();
  await app.prepare();
  const server = http.createServer((req, res) => handle(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function waitForDevServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok || res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

if (!process.versions.electron || isSmokerun) {
  // Plain-Node smoke test of the production server path (no window).
  (async () => {
    const dir = path.join(__dirname, "..");
    const { server, url } = await startProdServer(dir);
    const res = await fetch(url);
    const body = await res.text();
    console.log(`SMOKE url=${url} status=${res.status} bytes=${body.length}`);
    const ok = res.status === 200 && body.includes("Debate AI");
    server.close();
    process.exit(ok ? 0 : 1);
  })().catch((err) => {
    console.error("SMOKE-FAIL", err);
    process.exit(1);
  });
  return;
}

const { app, BrowserWindow, dialog } = require("electron");

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "Debate AI",
    backgroundColor: "#0d0d0d",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadURL(url);
  return win;
}

app.whenReady().then(async () => {
  let url;
  if (isDev) {
    url = "http://localhost:3000";
    const up = await waitForDevServer(url);
    if (!up) {
      dialog.showErrorBox(
        "Debate AI",
        "Could not reach the dev server at http://localhost:3000.\n\nRun `npm run dev` first, then launch the desktop app."
      );
    }
  } else {
    const { url: prodUrl } = await startProdServer(app.getAppPath());
    url = prodUrl;
  }
  createWindow(url);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
