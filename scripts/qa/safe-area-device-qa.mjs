#!/usr/bin/env node
/**
 * Safe Area P0 — full device QA (routes, nav modes, orientation, keyboard).
 * Usage: node scripts/qa/safe-area-device-qa.mjs [serial] [--nav 0|2] [--landscape]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const OUT = path.resolve("docs/perf/qa-safe-area");
const ORIGIN = process.env.CAPACITOR_SERVER_URL?.trim() || "https://samarket.vercel.app";

const args = process.argv.slice(2);
const serial = args.find((a) => !a.startsWith("--")) || process.env.ADB_SERIAL || "";
const navFlag = args.find((a) => a.startsWith("--nav="))?.split("=")[1];
const landscape = args.includes("--landscape");

const ROUTES = [
  { id: "philife", path: "/philife" },
  { id: "market", path: "/market" },
  { id: "stores", path: "/stores" },
  { id: "messenger", path: "/community-messenger?section=chats" },
  { id: "mypage", path: "/mypage" },
];

function adb(...a) {
  const base = serial ? ["-s", serial] : [];
  return spawnSync(ADB, [...base, ...a], { encoding: "utf8" });
}

function adbOut(...a) {
  return adb(...a).stdout.trim();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function focusApp() {
  adb("shell", "input", "keyevent", "KEYCODE_WAKEUP");
  adb("shell", "input", "keyevent", "KEYCODE_BACK");
  adb("shell", "input", "keyevent", "KEYCODE_BACK");
  adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`);
  sleep(800);
}

function screencap(name) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${serial || "device"}-${name}.png`);
  const buf = adb("exec-out", "screencap", "-p").stdout;
  if (buf && buf.length > 10000) fs.writeFileSync(file, buf);
  return { file, bytes: buf?.length ?? 0 };
}

async function connectCdp() {
  const pid = adbOut("shell", "pidof", PKG);
  if (!pid) throw new Error("app not running");
  spawnSync(ADB, [...(serial ? ["-s", serial] : []), "forward", "--remove", "tcp:9333"]);
  spawnSync(ADB, [...(serial ? ["-s", serial] : []), "forward", "tcp:9333", `localabstract:webview_devtools_remote_${pid}`]);
  const listRaw = spawnSync("curl", ["-s", "http://127.0.0.1:9333/json/list"], { encoding: "utf8" }).stdout;
  const list = JSON.parse(listRaw || "[]");
  const page =
    list.find((p) => p.type === "page" && /samarket|localhost|127\.0\.0\.1|vercel/.test(p.url || "")) ||
    list.find((p) => p.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("no CDP page");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
    setTimeout(() => reject(new Error("ws open timeout")), 10000);
  });

  let nextId = 1;
  const pending = new Map();

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      clearTimeout(timer);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails)));
      else resolve(msg.result);
    }
  });

  function send(method, params = {}, timeoutMs = 25000) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} timeout`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  return {
    ws,
    close: () => ws.close(),
    eval: async (expression, timeoutMs = 25000) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
      return r.result?.value;
    },
    navigate: async (url) => {
      await send("Page.navigate", { url });
      await sleep(6000);
    },
  };
}

const METRICS_EXPR = `JSON.stringify({
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
  clientHeight: document.documentElement.clientHeight,
  keyboard: window.samarketShell?.keyboardBottomInsetCssPx ?? null,
  chatBottomInset: getComputedStyle(document.documentElement).getPropertyValue('--chat-bottom-inset')
})`;

function setNavigationMode(mode) {
  if (mode === undefined || mode === null) return;
  adb("shell", "settings", "put", "secure", "navigation_mode", String(mode));
  sleep(1500);
}

function setOrientation(land) {
  adb("shell", "settings", "put", "system", "accelerometer_rotation", land ? "0" : "1");
  adb("shell", "settings", "put", "system", "user_rotation", land ? "1" : "0");
  sleep(1200);
}

async function runRouteChecks(cdp, routes) {
  const out = [];
  for (const route of routes) {
    focusApp();
    try {
      await cdp.navigate(`${ORIGIN.replace(/\/$/, "")}${route.path}`);
      focusApp();
      const metrics = JSON.parse(await cdp.eval(METRICS_EXPR));
      const shot = screencap(`${navFlag ?? "nav"}-${landscape ? "land" : "port"}-${route.id}`);
      out.push({ route: route.path, metrics, screenshot: shot });
    } catch (err) {
      out.push({ route: route.path, error: String(err.message || err) });
    }
  }
  return out;
}

async function runKeyboardCheck(cdp) {
  focusApp();
  try {
    await cdp.navigate(`${ORIGIN.replace(/\/$/, "")}/community-messenger?section=chats`);
    await sleep(2000);
    const roomPath = await cdp.eval(`
      (async () => {
        const links = [...document.querySelectorAll('a[href*="/community-messenger/rooms/"]')];
        const href = links[0]?.getAttribute('href');
        return href || null;
      })()
    `);
    if (!roomPath) return { error: "no room link found" };
    await cdp.navigate(`${ORIGIN.replace(/\/$/, "")}${roomPath.startsWith("/") ? roomPath : "/" + roomPath}`);
    await sleep(5000);
    const before = JSON.parse(await cdp.eval(METRICS_EXPR));
    await cdp.eval(`
      (() => {
        const el = document.querySelector('textarea, [contenteditable=true], input[type=text]');
        if (el) { el.focus(); el.click(); return true; }
        return false;
      })()
    `);
    adb("shell", "input", "tap", "540", "2100");
    sleep(500);
    adb("shell", "input", "text", "qa");
    sleep(1500);
    const open = JSON.parse(await cdp.eval(METRICS_EXPR));
    adb("shell", "input", "keyevent", "KEYCODE_BACK");
    sleep(1200);
    const closed = JSON.parse(await cdp.eval(METRICS_EXPR));
    const shot = screencap(`${navFlag ?? "nav"}-keyboard-open`);
    return { roomPath, before, open, closed, screenshot: shot };
  } catch (err) {
    return { error: String(err.message || err) };
  }
}

if (navFlag !== undefined) setNavigationMode(navFlag);
if (landscape) setOrientation(true);

adb("shell", "am", "force-stop", PKG);
adb("logcat", "-c");
adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`);
sleep(12000);
focusApp();

const device = {
  serial: serial || adbOut("devices").split("\n").find((l) => l.endsWith("\tdevice"))?.split("\t")[0] || "",
  model: adbOut("shell", "getprop", "ro.product.model"),
  sdk: adbOut("shell", "getprop", "ro.build.version.sdk"),
  wmSize: adbOut("shell", "wm", "size"),
  wmDensity: adbOut("shell", "wm", "density"),
  navigationMode: adbOut("shell", "settings", "get", "secure", "navigation_mode"),
  orientation: landscape ? "landscape" : "portrait",
  origin: ORIGIN,
};

const logcat = adbOut("logcat", "-d").split("\n").filter((l) => l.includes("DIBAY_SafeArea"));

let cdp;
const report = { device, logcat, routes: [], keyboard: null };

try {
  cdp = await connectCdp();
  report.routes = await runRouteChecks(cdp, ROUTES);
  report.keyboard = await runKeyboardCheck(cdp);
} catch (err) {
  report.error = String(err.message || err);
} finally {
  cdp?.close();
}

if (landscape) setOrientation(false);

console.log(JSON.stringify(report, null, 2));
