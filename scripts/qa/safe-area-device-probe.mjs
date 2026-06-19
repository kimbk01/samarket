#!/usr/bin/env node
/**
 * Safe Area P0 — adb device probe (logcat native insets + CDP WebView CSS vars).
 * Usage: node scripts/qa/safe-area-device-probe.mjs [serial]
 */
import { spawnSync } from "node:child_process";
import WebSocket from "ws";

const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const serial = process.argv[2] || process.env.ADB_SERIAL || "";

function adb(...args) {
  const base = serial ? ["-s", serial] : [];
  return spawnSync(ADB, [...base, ...args], { encoding: "utf8" }).stdout.trim();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function cdpEval(expr) {
  const pid = adb("shell", "pidof", PKG);
  if (!pid) throw new Error("app not running");
  spawnSync(ADB, [...(serial ? ["-s", serial] : []), "forward", "--remove", "tcp:9333"]);
  spawnSync(ADB, [...(serial ? ["-s", serial] : []), "forward", "tcp:9333", `localabstract:webview_devtools_remote_${pid}`]);
  const listRaw = spawnSync("curl", ["-s", "http://127.0.0.1:9333/json/list"], { encoding: "utf8" }).stdout;
  const list = JSON.parse(listRaw || "[]");
  const page = list.find((p) => p.type === "page" && p.url?.includes("samarket")) || list.find((p) => p.type === "page") || list[0];
  if (!page?.webSocketDebuggerUrl) throw new Error("no CDP page");

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const timer = setTimeout(() => reject(new Error("CDP timeout")), 15000);
    ws.on("open", () => {
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true } }));
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails)));
      else resolve(msg.result?.result?.value);
    });
    ws.on("error", reject);
  });
}

const METRICS_EXPR = `JSON.stringify({
  dibaySafeTop: document.documentElement.style.getPropertyValue('--dibay-safe-top'),
  dibaySafeBottom: document.documentElement.style.getPropertyValue('--dibay-safe-bottom'),
  safeTop: getComputedStyle(document.documentElement).getPropertyValue('--safe-top'),
  safeBottom: getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom'),
  envTop: (() => { const e = document.createElement('div'); e.style.paddingTop = 'env(safe-area-inset-top)'; document.body.appendChild(e); const v = getComputedStyle(e).paddingTop; e.remove(); return v; })(),
  envBottom: (() => { const e = document.createElement('div'); e.style.paddingBottom = 'env(safe-area-inset-bottom)'; document.body.appendChild(e); const v = getComputedStyle(e).paddingBottom; e.remove(); return v; })(),
  innerHeight: window.innerHeight,
  vvHeight: window.visualViewport?.height ?? null,
  clientHeight: document.documentElement.clientHeight,
  path: location.pathname
})`;

adb("shell", "am", "force-stop", PKG);
adb("logcat", "-c");
adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`);
sleep(9000);

const device = {
  serial: serial || adb("devices").split("\n").find((l) => l.endsWith("\tdevice"))?.split("\t")[0] || "",
  model: adb("shell", "getprop", "ro.product.model"),
  sdk: adb("shell", "getprop", "ro.build.version.sdk"),
  wmSize: adb("shell", "wm", "size"),
  wmDensity: adb("shell", "wm", "density"),
  navigationMode: adb("shell", "settings", "get", "secure", "navigation_mode"),
};

const logcat = adb("logcat", "-d")
  .split("\n")
  .filter((l) => l.includes("DIBAY_SafeArea"));

let webview = null;
try {
  webview = JSON.parse(await cdpEval(METRICS_EXPR));
} catch (err) {
  webview = { error: String(err.message || err) };
}

console.log(JSON.stringify({ device, logcat, webview }, null, 2));
