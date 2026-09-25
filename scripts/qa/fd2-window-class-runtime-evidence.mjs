#!/usr/bin/env node
/**
 * FD2 WindowClass runtime measurement ONLY.
 *
 * Reads existing viewport + app-shell safe-area + FD1 DeviceClass plugin.
 * Does not change UI, orientation policy, or FD1 classification.
 * Orientation is recorded as window context — not an FD3 lock check.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, ".tmp/fd2-window-class-runtime");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const ACT = "com.dibay.app/.MainActivity";
const IOS_UDID = process.env.IOS_UDID || "00008120-000025C826F3C01E";

const WINDOW_BANDS = {
  lockState: "CANDIDATE_NOT_LOCKED",
  compactMaxExclusive: 760,
  mediumMaxInclusive: 1229,
  expandedMaxInclusive: 1301,
};

const DEVICES = {
  samsung: {
    id: "samsung",
    serial: "RFCY40PY2CA",
    label: "Samsung SM-M156S",
    expectedClass: "PHONE_ANDROID",
    cdpPort: 9344,
  },
  xiaomi: {
    id: "xiaomi",
    serial: "8b37179f7d94",
    label: "Xiaomi 24076RP19G",
    expectedClass: "TABLET_ANDROID",
    cdpPort: 9345,
  },
};

const READ_EXPR = `(() => {
  const run = async () => {
    const cap = window.Capacitor || {};
    const headers = Array.isArray(cap.PluginHeaders) ? cap.PluginHeaders.map((h) => h && h.name) : [];
    const vv = window.visualViewport;
    const readSafe = (side) => {
      const token = side === "left" ? "var(--safe-left)" : "var(--safe-right)";
      const prop = side === "left" ? "paddingLeft" : "paddingRight";
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
        (side === "left" ? "padding-left:" : "padding-right:") + token;
      document.documentElement.appendChild(probe);
      const raw = getComputedStyle(probe)[prop];
      probe.remove();
      const px = Number.parseFloat(raw);
      return Number.isFinite(px) ? Math.max(0, Math.round(px)) : 0;
    };
    const innerWidth = Number(window.innerWidth || 0);
    const innerHeight = Number(window.innerHeight || 0);
    const visualViewportWidth = vv && typeof vv.width === "number" ? vv.width : null;
    const visualViewportHeight = vv && typeof vv.height === "number" ? vv.height : null;
    const safeLeftPx = readSafe("left");
    const safeRightPx = readSafe("right");
    const hasVisualWidth = visualViewportWidth != null && visualViewportWidth > 0;
    const availableWidth = hasVisualWidth ? visualViewportWidth : innerWidth;
    const usableWidth = Math.max(0, availableWidth - safeLeftPx - safeRightPx);
    const orientationType = (screen.orientation && screen.orientation.type) || null;
    const out = {
      href: String(location.href || ""),
      platform: typeof cap.getPlatform === "function" ? cap.getPlatform() : null,
      nativePluginPresent: headers.includes("DibayDeviceClass"),
      native: null,
      nativeError: null,
      orientationType,
      innerWidth,
      innerHeight,
      visualViewportWidth,
      visualViewportHeight,
      safeLeftPx,
      safeRightPx,
      availableWidth,
      availableWidthSource: hasVisualWidth ? "visualViewport.width" : "innerWidth",
      usableWidth,
    };
    try {
      if (typeof cap.nativePromise === "function") {
        out.native = await cap.nativePromise("DibayDeviceClass", "getDeviceClass", {});
      } else {
        out.nativeError = "nativePromise_unavailable";
      }
    } catch (e) {
      out.nativeError = String(e && e.message ? e.message : e);
    }
    return out;
  };
  return run();
})()`;

function ensureOut() {
  fs.mkdirSync(OUT, { recursive: true });
}

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeJson(name, value) {
  ensureOut();
  const file = path.join(OUT, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

function classifyWindowClass(usableWidthPx) {
  const width = Number.isFinite(usableWidthPx) ? Math.max(0, usableWidthPx) : 0;
  if (width < WINDOW_BANDS.compactMaxExclusive) return "COMPACT";
  if (width <= WINDOW_BANDS.mediumMaxInclusive) return "MEDIUM";
  if (width <= WINDOW_BANDS.expandedMaxInclusive) return "EXPANDED";
  return "LARGE";
}

function enrich(sample) {
  if (!sample) return null;
  return {
    ...sample,
    deviceClass: sample.native?.deviceClass ?? null,
    windowClass: classifyWindowClass(sample.usableWidth),
    windowClassLockState: WINDOW_BANDS.lockState,
  };
}

function launchApp(serial) {
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "input", "keyevent", "82");
  adb(serial, "shell", "am", "start", "-n", ACT);
}

function setUserRotation(serial, landscape) {
  adb(serial, "shell", "settings", "put", "system", "accelerometer_rotation", "0");
  adb(serial, "shell", "settings", "put", "system", "user_rotation", landscape ? "1" : "0");
  sleep(1500);
}

function restoreRotation(serial) {
  adb(serial, "shell", "settings", "put", "system", "user_rotation", "0");
  adb(serial, "shell", "settings", "put", "system", "accelerometer_rotation", "1");
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
  const page =
    list.find((p) => p.type === "page" && /samarket|localhost|127\.0\.0\.1|vercel/.test(p.url || "")) ||
    list.find((p) => p.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error(`no CDP page on ${serial}: ${listRaw?.slice(0, 400)}`);
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
    close: () => ws.close(),
    eval: async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      return r.result?.value;
    },
  };
}

function judgeAndroid(device, portrait, landscape) {
  const classOk =
    portrait?.deviceClass === device.expectedClass && landscape?.deviceClass === device.expectedClass;
  const identityStable = portrait?.deviceClass === landscape?.deviceClass;
  const measured = Number.isFinite(portrait?.usableWidth) && Number.isFinite(landscape?.usableWidth);
  return {
    deviceClassPreserved: classOk && identityStable,
    windowMeasured: measured,
    result: classOk && identityStable && measured ? "PASS" : "FAIL",
  };
}

async function observeAndroidDevice(device) {
  launchApp(device.serial);
  sleep(4000);
  setUserRotation(device.serial, false);
  sleep(800);
  const cdp = await connectAndroidCdp(device.serial, device.cdpPort);
  let portrait;
  let landscape;
  try {
    portrait = enrich(await cdp.eval(READ_EXPR));
    setUserRotation(device.serial, true);
    landscape = enrich(await cdp.eval(READ_EXPR));
  } finally {
    cdp.close();
    restoreRotation(device.serial);
  }
  const judged = judgeAndroid(device, portrait, landscape);
  const record = {
    DEVICE: device.label,
    SERIAL: device.serial,
    EXPECTED_DEVICE_CLASS: device.expectedClass,
    PORTRAIT: portrait,
    LANDSCAPE: landscape,
    JUDGE: judged,
    RESULT: judged.result,
    NOTE: "Rotation is window measurement only. FD3 orientation lock is not inspected.",
  };
  writeJson(`${device.id}.json`, record);
  return record;
}

async function evalIosPage(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
    setTimeout(() => reject(new Error("ios ws open timeout")), 10000);
  });
  let nextId = 1;
  const pending = new Map();
  let pageTargetId = null;
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.method === "Target.targetCreated") {
      const t = msg.params?.targetInfo;
      if (t?.type === "page" || (!pageTargetId && t?.type === "frame")) pageTargetId = t.targetId;
    }
    const inner =
      msg.method === "Target.receivedMessageFromTarget" || msg.method === "Target.dispatchMessageFromTarget"
        ? JSON.parse(msg.params?.message || "{}")
        : msg;
    const id = inner.id ?? msg.id;
    if (id && pending.has(id)) {
      const { resolve, reject, timer } = pending.get(id);
      clearTimeout(timer);
      pending.delete(id);
      if (inner.error || msg.error) reject(new Error(JSON.stringify(inner.error || msg.error)));
      else resolve(inner.result || msg.result || {});
    }
  });
  function send(method, params = {}, timeoutMs = 15000) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`iOS CDP ${method} timeout`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  try {
    await send("Target.setDiscoverTargets", { discover: true }).catch(() => null);
    const start = Date.now();
    while (!pageTargetId && Date.now() - start < 4000) sleep(50);
    if (!pageTargetId) {
      ws.close();
      return { ok: false, reason: "no_page_target" };
    }
    const call = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const innerId = nextId++;
        const outerId = nextId++;
        const timer = setTimeout(() => {
          pending.delete(innerId);
          reject(new Error("timeout"));
        }, 15000);
        pending.set(innerId, { resolve, reject, timer });
        ws.send(
          JSON.stringify({
            id: outerId,
            method: "Target.sendMessageToTarget",
            params: { targetId: pageTargetId, message: JSON.stringify({ id: innerId, method, params }) },
          }),
        );
      });
    await call("Runtime.enable", {}).catch(() => null);
    await call("Runtime.evaluate", {
      expression: `(() => {
        window.__fd2wc = { started: true };
        const run = ${READ_EXPR};
        Promise.resolve(run).then((r) => {
          window.__fd2wc = { done: true, sample: r };
        }).catch((e) => {
          window.__fd2wc = { done: true, nativeError: String(e && e.message ? e.message : e) };
        });
        return true;
      })()`,
      returnByValue: true,
    });
    let value = null;
    for (let i = 0; i < 40; i += 1) {
      const poll = await call("Runtime.evaluate", {
        expression: "JSON.stringify(window.__fd2wc||null)",
        returnByValue: true,
      });
      const raw = poll?.result?.result?.value ?? poll?.result?.value;
      if (typeof raw === "string") {
        const parsed = JSON.parse(raw);
        if (parsed?.done) {
          value = parsed.sample || parsed;
          break;
        }
      }
      sleep(200);
    }
    ws.close();
    if (!value) return { ok: false, reason: "poll_timeout" };
    return { ok: true, value, via: "target_poll" };
  } catch (e) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    return { ok: false, reason: String(e) };
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
  let list = [];
  try {
    list = JSON.parse(listRaw || "[]");
  } catch {
    list = [];
  }
  const pages = [...list].sort((a, b) => {
    const score = (p) => {
      const u = `${p.url || ""} ${p.title || ""}`;
      let s = 0;
      if (/samarket\.vercel\.app/i.test(u)) s += 5;
      if (/dibay|App/i.test(u)) s += 2;
      if (p.type === "page" || p.type === "webview") s += 1;
      return s;
    };
    return score(b) - score(a);
  });
  let sample = null;
  let via = null;
  let fail = `no ios webkit page: ${(listRaw || "").slice(0, 400)}`;
  for (const page of pages) {
    if (!page?.webSocketDebuggerUrl) continue;
    const hit = await evalIosPage(page.webSocketDebuggerUrl);
    if (hit.ok && (hit.value?.native?.deviceClass || hit.value?.usableWidth != null)) {
      sample = enrich(hit.value);
      via = hit.via;
      break;
    }
    fail = hit.reason || "empty";
  }
  const classOk = sample?.deviceClass === "PHONE_IOS";
  const measured = Number.isFinite(sample?.usableWidth);
  const record = {
    DEVICE: "iPhonebk",
    UDID: IOS_UDID,
    VIA: via,
    CURRENT: sample,
    PAGES: pages.map((p) => ({ url: p.url, title: p.title, type: p.type })),
    EXPECTED_DEVICE_CLASS: "PHONE_IOS",
    JUDGE: {
      deviceClassPreserved: classOk,
      windowMeasured: measured,
      result: classOk && measured ? "PASS" : "FAIL",
    },
    RESULT: classOk && measured ? "PASS" : "FAIL",
    NOTE: "Current orientation only. FD3 orientation lock is not inspected.",
    FAIL_REASON: sample ? null : fail,
  };
  writeJson("iphonebk.json", record);
  return record;
}

async function main() {
  ensureOut();
  const args = new Set(process.argv.slice(2));
  const out = {
    startedAt: new Date().toISOString(),
    windowClassLockState: WINDOW_BANDS.lockState,
    fd1Reopened: false,
  };
  if (args.has("--android") || args.has("--all")) {
    out.samsung = await observeAndroidDevice(DEVICES.samsung);
    out.xiaomi = await observeAndroidDevice(DEVICES.xiaomi);
  }
  if (args.has("--ios-observe") || args.has("--all")) {
    out.iphonebk = await observeIos();
  }
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
