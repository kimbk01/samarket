#!/usr/bin/env node
/**
 * FD5 Community presentation runtime evidence.
 * Does not reopen FD1–FD4 Device/shell identity.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, ".tmp/fd5-community-runtime");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const ACT = "com.dibay.app/.MainActivity";
const IOS_UDID = process.env.IOS_UDID || "00008120-000025C826F3C01E";

const DEVICES = {
  samsung: { id: "samsung", serial: "RFCY40PY2CA", label: "Samsung SM-M156S", expectedClass: "PHONE_ANDROID", expectedPresentation: "SINGLE", cdpPort: 9374 },
  xiaomi: { id: "xiaomi", serial: "8b37179f7d94", label: "Xiaomi 24076RP19G", expectedClass: "TABLET_ANDROID", expectedPresentation: null, cdpPort: 9375 },
};

const READ_EXPR = `(() => {
  const root = document.querySelector("[data-community-ui]");
  const feed = document.querySelector("[data-community-feed='list'], [data-dibay-community-pane='list']");
  const detail = document.querySelector(".community-post-detail-fade-in, [data-dibay-community-pane='detail']");
  const dual = document.querySelector(".dibay-community-dual-frame");
  const firstCard = document.querySelector("article[data-community-card='post'] a[href*='/philife/']");
  return {
    href: String(location.href || ""),
    pathname: String(location.pathname || ""),
    innerWidth: Number(window.innerWidth || 0),
    innerHeight: Number(window.innerHeight || 0),
    presentation: root ? root.getAttribute("data-dibay-community-presentation") : null,
    surface: root ? root.getAttribute("data-dibay-community-surface") : null,
    composed: root ? root.getAttribute("data-dibay-community-composed") : null,
    layoutMode: root ? root.getAttribute("data-dibay-community-layout-mode") : null,
    deviceClass: document.querySelector(".app-shell")?.getAttribute("data-dibay-device-class") || null,
    hasFeed: Boolean(feed),
    hasDetail: Boolean(detail),
    hasDualFrame: Boolean(dual),
    firstPostHref: firstCard ? firstCard.getAttribute("href") : null,
  };
})()`;

function ensureOut() {
  fs.mkdirSync(OUT, { recursive: true });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeJson(name, value) {
  ensureOut();
  fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function launchApp(serial) {
  adb(serial, "shell", "am", "start", "-n", ACT);
}

async function connectAndroidCdp(serial, port) {
  const pid = (adb(serial, "shell", "pidof", PKG).stdout || "").trim();
  if (!pid) throw new Error(`app not running on ${serial}`);
  spawnSync(ADB, ["-s", serial, "forward", "--remove", `tcp:${port}`], { encoding: "utf8" });
  const fwd = spawnSync(ADB, ["-s", serial, "forward", `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`], {
    encoding: "utf8",
  });
  if (fwd.status !== 0) throw new Error(`adb forward failed: ${fwd.stderr || fwd.stdout}`);
  const listRaw = spawnSync("curl", ["-s", `http://127.0.0.1:${port}/json/list`], { encoding: "utf8" }).stdout;
  const list = JSON.parse(listRaw || "[]");
  const page = list.find((p) => p.type === "page" && /samarket|vercel/.test(p.url || "")) || list.find((p) => p.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error(`no CDP page: ${(listRaw || "").slice(0, 300)}`);
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
      else resolve(msg.result);
    }
  });
  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} timeout`));
      }, 20000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  return {
    close: () => ws.close(),
    eval: async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      return r.result?.value;
    },
  };
}

function judgePhone(sample) {
  const ok =
    sample?.deviceClass === "PHONE_ANDROID" &&
    sample?.presentation === "SINGLE" &&
    sample?.composed === "single" &&
    sample?.hasDualFrame !== true;
  return { result: ok ? "PASS" : "FAIL", sample };
}

function judgeTablet(sample, expectDual) {
  if (sample?.deviceClass !== "TABLET_ANDROID") return { result: "FAIL", sample };
  if (expectDual) {
    return { result: sample.presentation === "DUAL" && sample.hasDualFrame === true ? "PASS" : "FAIL", sample };
  }
  return { result: sample.presentation === "STACKED" && sample.hasDualFrame !== true ? "PASS" : "FAIL", sample };
}

async function observeAndroid(device) {
  launchApp(device.serial);
  sleep(2500);
  const cdp = await connectAndroidCdp(device.serial, device.cdpPort);
  try {
    await cdp.eval(`(() => { location.assign("/philife"); return true; })()`);
    sleep(2800);
    const list = await cdp.eval(READ_EXPR);
    let detail = null;
    let back = null;
    if (list?.firstPostHref) {
      await cdp.eval(`(() => { location.assign(${JSON.stringify(list.firstPostHref)}); return true; })()`);
      sleep(2800);
      detail = await cdp.eval(READ_EXPR);
      await cdp.eval(`(() => { history.back(); return true; })()`);
      sleep(2200);
      back = await cdp.eval(READ_EXPR);
    }
    const expectDual = device.id === "xiaomi" ? list?.innerWidth >= 840 || list?.innerHeight >= 840 : false;
    const judged =
      device.expectedPresentation === "SINGLE"
        ? {
            list: judgePhone(list),
            detail: detail ? judgePhone(detail) : { result: "NOT_PROVEN" },
            back: back ? judgePhone(back) : { result: "NOT_PROVEN" },
          }
        : {
            list: judgeTablet(list, list?.presentation === "DUAL" || (list?.innerWidth || 0) >= 840),
            detail: detail ? judgeTablet(detail, detail?.presentation === "DUAL") : { result: "NOT_PROVEN" },
            back: back ? judgeTablet(back, back?.presentation === "DUAL") : { result: "NOT_PROVEN" },
          };
    const result =
      judged.list.result === "PASS" &&
      (judged.detail.result === "PASS" || judged.detail.result === "NOT_PROVEN") &&
      (judged.back.result === "PASS" || judged.back.result === "NOT_PROVEN")
        ? judged.detail.result === "NOT_PROVEN"
          ? "NOT_PROVEN"
          : "PASS"
        : "FAIL";
    const record = { DEVICE: device.label, SERIAL: device.serial, LIST: list, DETAIL: detail, BACK: back, JUDGE: judged, RESULT: result, expectDual };
    writeJson(`${device.id}.json`, record);
    return record;
  } finally {
    cdp.close();
  }
}

async function observeIos() {
  const proxyOut = path.join(OUT, "ios-webkit-proxy.out");
  spawnSync("pkill", ["-f", "ios_webkit_debug_proxy"], { encoding: "utf8" });
  sleep(400);
  spawnSync("sh", ["-c", `ios_webkit_debug_proxy -c ${IOS_UDID}:9222 >${JSON.stringify(proxyOut)} 2>&1 &`], {
    encoding: "utf8",
  });
  sleep(2200);
  const listRaw = spawnSync("curl", ["-s", "http://127.0.0.1:9222/json"], { encoding: "utf8" }).stdout;
  let pages = [];
  try {
    pages = JSON.parse(listRaw || "[]");
  } catch {
    pages = [];
  }
  const page = pages.find((p) => /samarket\.vercel\.app/i.test(p.url || "")) || pages[0];
  const record = {
    DEVICE: "iPhonebk",
    UDID: IOS_UDID,
    PAGES: pages.map((p) => ({ url: p.url, title: p.title })),
    RESULT: page?.webSocketDebuggerUrl ? "INSPECTOR_READY" : "NOT_PROVEN",
    NOTE: "Use USB inspect + evaluate Community presentation. Do not infer from BottomNav.",
  };
  writeJson("iphonebk.json", record);
  return record;
}

async function main() {
  ensureOut();
  const args = new Set(process.argv.slice(2));
  const out = { startedAt: new Date().toISOString(), fd1Reopened: false, fd2Reopened: false, fd3Reopened: false, fd4Reopened: false };
  if (args.has("--android") || args.has("--all")) {
    if (!args.has("--xiaomi-only")) out.samsung = await observeAndroid(DEVICES.samsung);
    if (!args.has("--samsung-only")) out.xiaomi = await observeAndroid(DEVICES.xiaomi);
  }
  if (args.has("--ios-observe") || args.has("--all")) out.iphonebk = await observeIos();
  writeJson("SUMMARY.json", out);
  console.log(JSON.stringify(out, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    writeJson("ERROR.json", { error: String(err), stack: err?.stack ?? null });
    process.exit(1);
  });
}
