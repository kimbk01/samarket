#!/usr/bin/env node
/** Tablet-safe route probe — force-stop + cold navigate per route (avoids CDP stuck). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const ADB = `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const serial = process.argv[2] || "8b37179f7d94";
const ORIGIN = process.env.CAPACITOR_SERVER_URL?.trim() || "https://samarket.vercel.app";
const OUT = path.resolve("docs/perf/qa-safe-area");
const ROUTES = [
  { id: "philife", path: "/philife" },
  { id: "community", path: "/community" },
  { id: "market", path: "/market" },
  { id: "stores", path: "/stores" },
  { id: "messenger", path: "/community-messenger?section=chats" },
];

const adb = (...a) => spawnSync(ADB, ["-s", serial, ...a], { encoding: "utf8" });
const out = (...a) => adb(...a).stdout.trim();
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const METRICS = `JSON.stringify({
  path: location.pathname + location.search,
  dibayInlineTop: document.documentElement.style.getPropertyValue('--dibay-safe-top'),
  dibayInlineBottom: document.documentElement.style.getPropertyValue('--dibay-safe-bottom'),
  dibayComputedTop: getComputedStyle(document.documentElement).getPropertyValue('--dibay-safe-top'),
  dibayComputedBottom: getComputedStyle(document.documentElement).getPropertyValue('--dibay-safe-bottom'),
  safeTop: getComputedStyle(document.documentElement).getPropertyValue('--safe-top'),
  safeBottom: getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom'),
  envTop: (() => { const e = document.createElement('div'); e.style.paddingTop = 'env(safe-area-inset-top)'; document.body.appendChild(e); const v = getComputedStyle(e).paddingTop; e.remove(); return v; })(),
  envBottom: (() => { const e = document.createElement('div'); e.style.paddingBottom = 'env(safe-area-inset-bottom)'; document.body.appendChild(e); const v = getComputedStyle(e).paddingBottom; e.remove(); return v; })(),
  innerHeight: window.innerHeight,
  vvHeight: window.visualViewport?.height ?? null,
  keyboard: window.samarketShell?.keyboardBottomInsetCssPx ?? null
})`;

async function cdpOnce(url) {
  adb("shell", "am", "force-stop", PKG);
  adb("logcat", "-c");
  adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`);
  sleep(12000);
  adb("shell", "input", "keyevent", "KEYCODE_WAKEUP");
  adb("shell", "input", "keyevent", "KEYCODE_BACK");

  const pid = out("shell", "pidof", PKG);
  if (!pid) throw new Error("app not running");
  spawnSync(ADB, ["-s", serial, "forward", "--remove", "tcp:9333"]);
  spawnSync(ADB, ["-s", serial, "forward", "tcp:9333", `localabstract:webview_devtools_remote_${pid}`]);
  const list = JSON.parse(spawnSync("curl", ["-s", "http://127.0.0.1:9333/json/list"], { encoding: "utf8" }).stdout || "[]");
  const page = list.find((p) => p.type === "page") || list[0];
  if (!page?.webSocketDebuggerUrl) throw new Error("no CDP");

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 1;
    const pending = new Map();
    const timer = setTimeout(() => reject(new Error("cdp timeout")), 45000);
    ws.on("open", async () => {
      const send = (method, params) =>
        new Promise((r, j) => {
          const i = id++;
          const t = setTimeout(() => j(new Error(method)), 30000);
          pending.set(i, { r, j, t });
          ws.send(JSON.stringify({ id: i, method, params }));
        });
      ws.on("message", (d) => {
        const m = JSON.parse(d.toString());
        if (m.id && pending.has(m.id)) {
          const { r, j, t } = pending.get(m.id);
          clearTimeout(t);
          pending.delete(m.id);
          if (m.error || m.result?.exceptionDetails) j(new Error(JSON.stringify(m.error || m.result.exceptionDetails)));
          else r(m.result);
        }
      });
      try {
        await send("Page.navigate", { url });
        sleep(8000);
        const val = (await send("Runtime.evaluate", { expression: METRICS, returnByValue: true })).result?.value;
        clearTimeout(timer);
        ws.close();
        resolve(JSON.parse(val));
      } catch (e) {
        clearTimeout(timer);
        ws.close();
        reject(e);
      }
    });
    ws.on("error", reject);
  });
}

fs.mkdirSync(OUT, { recursive: true });
const device = {
  serial,
  model: out("shell", "getprop", "ro.product.model"),
  sdk: out("shell", "getprop", "ro.build.version.sdk"),
  navigationMode: out("shell", "settings", "get", "secure", "navigation_mode"),
  origin: ORIGIN,
};
const results = [];

for (const route of ROUTES) {
  const url = `${ORIGIN.replace(/\/$/, "")}${route.path}`;
  try {
    const metrics = await cdpOnce(url);
    const shotPath = path.join(OUT, `${serial}-prod-${route.id}.png`);
    const buf = adb("exec-out", "screencap", "-p").stdout;
    fs.writeFileSync(shotPath, buf);
    const logcat = out("logcat", "-d").split("\n").filter((l) => l.includes("DIBAY_SafeArea"));
    results.push({ route: route.path, metrics, screenshot: shotPath, bytes: buf.length, logcat });
  } catch (err) {
    results.push({ route: route.path, error: String(err.message || err) });
  }
}

console.log(JSON.stringify({ device, results }, null, 2));
