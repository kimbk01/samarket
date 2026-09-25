#!/usr/bin/env node
/**
 * FD3 application-orientation runtime evidence.
 * Reads DeviceClass + viewport after physical rotation / cold landscape launch.
 * Does not change Call, UI, or FD1/FD2 numbers.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, ".tmp/fd3-orientation-runtime");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const ACT = "com.dibay.app/.MainActivity";
const IOS_UDID = process.env.IOS_UDID || "00008120-000025C826F3C01E";

const DEVICES = {
  samsung: { id: "samsung", serial: "RFCY40PY2CA", label: "Samsung SM-M156S", expectedClass: "PHONE_ANDROID", cdpPort: 9354, expectAppPortrait: true },
  xiaomi: { id: "xiaomi", serial: "8b37179f7d94", label: "Xiaomi 24076RP19G", expectedClass: "TABLET_ANDROID", cdpPort: 9355, expectAppPortrait: false },
};

const READ_EXPR = `(() => {
  const run = async () => {
    const cap = window.Capacitor || {};
    const vv = window.visualViewport;
    const headers = Array.isArray(cap.PluginHeaders) ? cap.PluginHeaders.map((h) => h && h.name) : [];
    const out = {
      href: String(location.href || ""),
      nativePluginPresent: headers.includes("DibayDeviceClass"),
      native: null,
      nativeError: null,
      orientationType: (screen.orientation && screen.orientation.type) || null,
      innerWidth: Number(window.innerWidth || 0),
      innerHeight: Number(window.innerHeight || 0),
      visualViewportWidth: vv && typeof vv.width === "number" ? vv.width : null,
      visualViewportHeight: vv && typeof vv.height === "number" ? vv.height : null,
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
    out.deviceClass = out.native && out.native.deviceClass ? out.native.deviceClass : null;
    out.appOrientation = out.innerWidth > out.innerHeight ? "landscape" : "portrait";
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

function launchApp(serial) {
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "input", "keyevent", "82");
  adb(serial, "shell", "am", "start", "-n", ACT);
}

function forceStop(serial) {
  adb(serial, "shell", "am", "force-stop", PKG);
}

function setUserRotation(serial, landscape) {
  adb(serial, "shell", "settings", "put", "system", "accelerometer_rotation", "0");
  adb(serial, "shell", "settings", "put", "system", "user_rotation", landscape ? "1" : "0");
  sleep(1600);
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

async function readAndroid(device) {
  const cdp = await connectAndroidCdp(device.serial, device.cdpPort);
  try {
    return await cdp.eval(READ_EXPR);
  } finally {
    cdp.close();
  }
}

function judgeSamsung(portrait, landscapeHeld, coldLandscape) {
  const classOk =
    portrait?.deviceClass === "PHONE_ANDROID" &&
    landscapeHeld?.deviceClass === "PHONE_ANDROID" &&
    coldLandscape?.deviceClass === "PHONE_ANDROID";
  const shellPortrait =
    portrait?.appOrientation === "portrait" &&
    landscapeHeld?.appOrientation === "portrait" &&
    coldLandscape?.appOrientation === "portrait";
  const noSnap = coldLandscape?.appOrientation === "portrait";
  return {
    deviceClassPreserved: classOk,
    appShellPortrait: shellPortrait,
    coldLandscapePortrait: noSnap,
    result: classOk && shellPortrait && noSnap ? "PASS" : "FAIL",
  };
}

function judgeXiaomi(portrait, landscape, returnPortrait) {
  const classOk =
    portrait?.deviceClass === "TABLET_ANDROID" &&
    landscape?.deviceClass === "TABLET_ANDROID" &&
    returnPortrait?.deviceClass === "TABLET_ANDROID";
  const rotates =
    portrait?.appOrientation === "portrait" &&
    landscape?.appOrientation === "landscape" &&
    returnPortrait?.appOrientation === "portrait";
  return {
    deviceClassPreserved: classOk,
    tabletRotates: rotates,
    result: classOk && rotates ? "PASS" : "FAIL",
  };
}

async function observeSamsung(device) {
  setUserRotation(device.serial, false);
  launchApp(device.serial);
  sleep(4000);
  const portrait = await readAndroid(device);
  setUserRotation(device.serial, true);
  const landscapeHeld = await readAndroid(device);
  forceStop(device.serial);
  sleep(800);
  launchApp(device.serial);
  sleep(4500);
  const coldLandscape = await readAndroid(device);
  restoreRotation(device.serial);
  const judged = judgeSamsung(portrait, landscapeHeld, coldLandscape);
  const record = {
    DEVICE: device.label,
    SERIAL: device.serial,
    PHYSICAL: { portrait, landscapeHeld, coldLandscape },
    JUDGE: judged,
    RESULT: judged.result,
  };
  writeJson("samsung.json", record);
  return record;
}

async function observeXiaomi(device) {
  setUserRotation(device.serial, false);
  launchApp(device.serial);
  sleep(4000);
  const portrait = await readAndroid(device);
  setUserRotation(device.serial, true);
  const landscape = await readAndroid(device);
  setUserRotation(device.serial, false);
  const returnPortrait = await readAndroid(device);
  restoreRotation(device.serial);
  const judged = judgeXiaomi(portrait, landscape, returnPortrait);
  const record = {
    DEVICE: device.label,
    SERIAL: device.serial,
    PHYSICAL: { portrait, landscape, returnPortrait },
    JUDGE: judged,
    RESULT: judged.result,
  };
  writeJson("xiaomi.json", record);
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
        window.__fd3or = { started: true };
        Promise.resolve(${READ_EXPR}).then((r) => {
          window.__fd3or = { done: true, sample: r };
        }).catch((e) => {
          window.__fd3or = { done: true, nativeError: String(e && e.message ? e.message : e) };
        });
        return true;
      })()`,
      returnByValue: true,
    });
    let value = null;
    for (let i = 0; i < 40; i += 1) {
      const poll = await call("Runtime.evaluate", {
        expression: "JSON.stringify(window.__fd3or||null)",
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
    return { ok: true, value };
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
  let fail = `no ios webkit page: ${(listRaw || "").slice(0, 400)}`;
  for (const page of pages) {
    if (!page?.webSocketDebuggerUrl) continue;
    const hit = await evalIosPage(page.webSocketDebuggerUrl);
    if (hit.ok && (hit.value?.deviceClass || hit.value?.innerWidth != null)) {
      sample = hit.value;
      break;
    }
    fail = hit.reason || "empty";
  }
  const classOk = sample?.deviceClass === "PHONE_IOS";
  const portrait = sample?.appOrientation === "portrait";
  const record = {
    DEVICE: "iPhonebk",
    UDID: IOS_UDID,
    CURRENT: sample,
    PAGES: pages.map((p) => ({ url: p.url, title: p.title, type: p.type })),
    JUDGE: {
      deviceClassPreserved: classOk,
      appShellPortrait: portrait,
      coldLandscape: "CHECKED_IF_CURRENT_IS_AFTER_COLD",
      result: classOk && portrait ? "PASS" : "FAIL",
    },
    RESULT: classOk && portrait ? "PASS" : "FAIL",
    FAIL_REASON: sample ? null : fail,
    NOTE: "Physical rotate + cold landscape are executed by the install harness before this read when available.",
  };
  writeJson("iphonebk.json", record);
  return record;
}

async function main() {
  ensureOut();
  const args = new Set(process.argv.slice(2));
  const out = { startedAt: new Date().toISOString(), fd1Reopened: false, fd2BandsRelocked: false };
  if (args.has("--android") || args.has("--all")) {
    if (!args.has("--xiaomi-only")) out.samsung = await observeSamsung(DEVICES.samsung);
    if (!args.has("--samsung-only")) out.xiaomi = await observeXiaomi(DEVICES.xiaomi);
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
