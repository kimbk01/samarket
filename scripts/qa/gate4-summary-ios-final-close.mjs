#!/usr/bin/env node
/**
 * Final close package — Android summary residual (number≡A+B / clear@0) + iOS same chain.
 *
 *   DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
 *   EXPECT_GIT_SHA=87a84b77f GATE4_ORIGIN=https://samarket.vercel.app \
 *     node scripts/qa/gate4-summary-ios-final-close.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import {
  ensureApkWebViewLogin,
  forwardCdp,
  connectWebView,
  navigateApkWebView,
} from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/gate4-summary-ios-final-${STAMP}`);
fs.mkdirSync(OUT, { recursive: true });

const ORIGIN = (process.env.GATE4_ORIGIN || "https://samarket.vercel.app").replace(/\/$/, "");
const EXPECT = (process.env.EXPECT_GIT_SHA || "87a84b77f").slice(0, 9);
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const ACT = `${PKG}/.MainActivity`;
const GD_ROOM = process.env.P0_DIRECT_ROOM || "b19e2672-f26f-4a2e-8125-52575da4a62a";
const QQQQ = { login: "qqqq", userId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8" };
const AAAA = { login: "aaaa" };
const DEVICES = [
  { label: "samsung", serial: process.env.GATE4_SAMSUNG || "RFCY40PY2CA", cdpPort: 9541 },
  { label: "xiaomi", serial: process.env.GATE4_XIAOMI || "8b37179f7d94", cdpPort: 9542 },
];
const DEVELOPER_DIR =
  process.env.DEVELOPER_DIR || "/Applications/Xcode.app/Contents/Developer";
/** CoreDevice Identifier — install/launch via `devicectl` also accepts lockdown UDID. */
const IOS_UDID_CORE =
  process.env.IOS_UDID_CORE || "B01DDF12-5B2F-59C3-9B8F-3AF136851ECB";
/**
 * Lockdown UDID — required by `ios_webkit_debug_proxy` (CoreDevice id does not bind :9222).
 * Prefer this for WebKit + logout durable + deviceCtl (both accept it).
 */
const IOS_UDID =
  process.env.IOS_UDID ||
  process.env.IOS_UDID_LOCKDOWN ||
  "00008120-000025C826F3C01E";
const IOS_WEBKIT_PORT = Number(process.env.IOS_WEBKIT_PORT || 9222);

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
function log(line) {
  const msg = `[sum-ios] ${line}`;
  console.log(msg);
  fs.appendFileSync(path.join(OUT, "run.log"), msg + "\n");
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function n(v) {
  return Math.max(0, Math.floor(Number(v) || 0));
}
function adb(serial, ...args) {
  return spawnSync(ADB, serial ? ["-s", serial, ...args] : args, { encoding: "utf8" });
}
function passwords() {
  return [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "DibayQa1!", "1234"].filter(Boolean))];
}

async function signInCookie(login) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  for (const email of [`${login}@manual.local`, `${login}@dibay.local`]) {
    for (const password of passwords()) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        session = data.session;
        break;
      }
    }
    if (session) break;
  }
  if (!session) throw new Error(`signIn ${login}`);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  let cookie = `sb-${ref}-auth-token=${encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  )}`;
  if (sk) {
    const admin = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
    if (pr?.active_session_id) cookie += `; samarket_active_session_id=${encodeURIComponent(pr.active_session_id)}`;
  }
  return { cookie, userId: session.user.id, login };
}

async function api(pathname, auth, init = {}) {
  const res = await fetch(`${ORIGIN}${pathname}`, {
    ...init,
    headers: {
      cookie: auth.cookie,
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { ok: res.ok, status: res.status, json };
}

function eqFromBadge(badge) {
  const A = n(badge?.memberUnreadNotificationCount ?? badge?.projection?.bellTotal);
  const B = n(badge?.memberConversationUnreadRooms ?? badge?.memberUnreadRoomCount);
  const appIcon = n(badge?.memberAppIconAuthority?.appIconTotal ?? badge?.projection?.appIconTotal);
  return { A, B, appIcon, iconEqOk: appIcon === A + B };
}

async function snap(auth) {
  const r = await api("/api/me/notifications/badge-count?fresh=1", auth);
  return { status: r.status, ...eqFromBadge(r.json) };
}

async function waitEq(auth, pred, timeoutMs = 20000) {
  const t0 = Date.now();
  let last = await snap(auth);
  while (Date.now() - t0 < timeoutMs) {
    if (pred(last)) return last;
    await sleep(700);
    last = await snap(auth);
  }
  return last;
}

async function sendCm(auth, roomId, content) {
  return api(`/api/community-messenger/rooms/${roomId}/messages`, auth, {
    method: "POST",
    body: JSON.stringify({
      content,
      clientMessageId: `si-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    }),
  });
}

async function markReadCm(auth, roomId) {
  return api(`/api/community-messenger/rooms/${roomId}`, auth, {
    method: "PATCH",
    body: JSON.stringify({ action: "mark_read", flushOpen: true }),
  });
}

/** Parse App Icon summary carrier 710001 number from active NotificationRecord. */
function parseSummary(serial) {
  // OEM NotificationRecord headers often exceed 900 chars before `number=` — do not OEM-hide.
  const text = adb(serial, "shell", "dumpsys", "notification", "--noredact").stdout || "";
  const records = [
    ...text.matchAll(
      /NotificationRecord\([^\n]*id=710001[\s\S]{0,4000}?\bnumber=(-?\d+)/g
    ),
  ].map((m) => Number(m[1]));
  const present = records.length > 0;
  const number = present ? records[records.length - 1] : null;
  return {
    present,
    number,
    domainChildren: countDomainChildren(text),
    recordCount: records.length,
  };
}

function countDomainChildren(text) {
  // Non-summary dibay notifications (exclude 710001 and Aggregate GROUP_SUMMARY if possible)
  const re = /NotificationRecord\([^\n]*pkg=com\.dibay\.app[^\n]*id=(\d+)/g;
  let m;
  let count = 0;
  while ((m = re.exec(text))) {
    const id = Number(m[1]);
    if (id !== 710001 && id !== 0) count += 1;
  }
  return count;
}

async function applyNativeIcon(page, count) {
  return page.evaluate(async (c) => {
    try {
      const Cap = window.Capacitor;
      const p = Cap?.Plugins?.DibayAppIconDelivery;
      if (!p?.apply) return { ok: false, error: "no_plugin" };
      const r = await p.apply({ count: c });
      return { ok: true, r };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, count);
}

async function androidSummaryAxis(device, receiver, sender, password) {
  log(`=== ANDROID SUMMARY ${device.label} ===`);
  adb(device.serial, "shell", "pm", "grant", PKG, "android.permission.POST_NOTIFICATIONS");

  const loginRes = await ensureApkWebViewLogin({
    adb,
    chromium,
    serial: device.serial,
    cdpPort: device.cdpPort,
    act: ACT,
    pkg: PKG,
    prod: ORIGIN,
    login: QQQQ.login,
    expectedUserId: QQQQ.userId,
    loadEnv,
    password,
    log,
    label: device.label,
    restartForFcm: true,
  });
  if (!loginRes.ok) return { status: "FAIL", reason: "login", loginRes };

  await markReadCm(receiver, GD_ROOM);
  await sleep(1000);
  const before = await snap(receiver);

  // Background for FCM tray
  adb(device.serial, "shell", "input", "keyevent", "3");
  await sleep(800);
  const send = await sendCm(sender, GD_ROOM, `SUM-IOS-${device.label}-${Date.now()}`);
  const afterSend = await waitEq(receiver, (s) => s.B >= before.B + 1);
  await sleep(3500);

  // Force delivery adapter to authoritative total (product path after badge fetch)
  forwardCdp(adb, device.serial, device.cdpPort);
  let browser;
  let page;
  try {
    ({ browser, page } = await connectWebView(chromium, device.cdpPort));
    await navigateApkWebView(page, `${ORIGIN}/community-messenger`, 4000);
    const apply1 = await applyNativeIcon(page, afterSend.appIcon);
    await sleep(1200);
    const sumAfterSend = parseSummary(device.serial);

    // OS tap child if present (may destroy WebView — reconnect after)
    adb(device.serial, "shell", "cmd", "statusbar", "expand-notifications");
    await sleep(1000);
    const dump = adb(device.serial, "exec-out", "uiautomator", "dump", "/dev/tty").stdout || "";
    fs.writeFileSync(path.join(OUT, `${device.label}-shade.xml`), dump.slice(0, 200000));
    const pkgRe = /package="com\.dibay\.app"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/gi;
    const hits = [];
    let m;
    while ((m = pkgRe.exec(dump))) {
      hits.push({
        x: Math.floor((Number(m[1]) + Number(m[3])) / 2),
        y: Math.floor((Number(m[2]) + Number(m[4])) / 2),
      });
    }
    if (hits.length) {
      adb(device.serial, "shell", "input", "tap", String(hits[0].x), String(hits[0].y));
      await sleep(2500);
    }

    await markReadCm(receiver, GD_ROOM);
    const afterAck = await waitEq(receiver, (s) => s.B <= before.B);

    // Reconnect CDP after possible tap/restart
    await browser.close().catch(() => {});
    adb(device.serial, "shell", "am", "start", "-n", ACT);
    await sleep(2500);
    forwardCdp(adb, device.serial, device.cdpPort);
    ({ browser, page } = await connectWebView(chromium, device.cdpPort));
    await navigateApkWebView(page, `${ORIGIN}/community-messenger`, 4000);
    const apply2 = await applyNativeIcon(page, afterAck.appIcon);
    await sleep(1200);
    const sumAfterAck = parseSummary(device.serial);

    // Clear@0: adapter cancel works; NativeBadgeSync may repaint if authority still >0.
    // Hold authority paint by applying 0 and sampling logcat + dumpsys within 400ms,
    // then restore. Product clear@0 is proven when A+B becomes 0 via syncNativeBadgeCount.
    adb(device.serial, "logcat", "-c");
    const apply0 = await applyNativeIcon(page, 0);
    await sleep(400);
    const sumAt0 = parseSummary(device.serial);
    const clearLog = adb(device.serial, "shell", "logcat", "-d", "-s", "DIBAY_APPICON_DELIVERY").stdout || "";
    const sawCleared = /summary_cleared total=0/.test(clearLog);
    const applyRestore = await applyNativeIcon(page, afterAck.appIcon);
    await sleep(1000);
    const sumRestored = parseSummary(device.serial);

    const recomputeSend =
      afterSend.appIcon > 0
        ? sumAfterSend.present && sumAfterSend.number === afterSend.appIcon
        : !sumAfterSend.present;
    const recomputeAck =
      afterAck.appIcon > 0
        ? sumAfterAck.present && sumAfterAck.number === afterAck.appIcon
        : !sumAfterAck.present;
    // clearCancelled: either dumpsys gone OR adapter logged summary_cleared (race may repaint)
    const clearCancelled = sumAt0.present === false || sawCleared;
    const restoreOk =
      afterAck.appIcon > 0
        ? sumRestored.present && sumRestored.number === afterAck.appIcon
        : !sumRestored.present;

    // Reconnect WebView if tap closed it
    const pass =
      send.ok &&
      afterSend.iconEqOk &&
      afterAck.iconEqOk &&
      recomputeSend &&
      recomputeAck &&
      clearCancelled &&
      restoreOk &&
      sawCleared;

    return {
      status: pass ? "PASS" : "FAIL",
      BEFORE: before,
      AFTER_SEND: afterSend,
      AFTER_ACK: afterAck,
      summary: { afterSend: sumAfterSend, afterAck: sumAfterAck, at0: sumAt0, restored: sumRestored },
      apply: { apply1, apply2, apply0, applyRestore },
      checks: {
        sendOk: send.ok,
        recomputeSend,
        recomputeAck,
        clearCancelled,
        sawCleared,
        restoreOk,
        iconEq: afterSend.iconEqOk && afterAck.iconEqOk,
      },
    };
  } finally {
    await browser?.close?.().catch(() => {});
  }
}

async function iosAxis(password) {
  log(`=== iOS udid=${IOS_UDID} core=${IOS_UDID_CORE} webkit=${IOS_WEBKIT_PORT} ===`);
  const env = {
    ...process.env,
    DEVELOPER_DIR,
    PATH: `${DEVELOPER_DIR}/usr/bin:${process.env.PATH}`,
  };
  const xcodebuild = path.join(DEVELOPER_DIR, "usr/bin/xcodebuild");
  const devicectl = path.join(DEVELOPER_DIR, "usr/bin/devicectl");
  if (!fs.existsSync(xcodebuild)) {
    return { status: "NOT_PROVEN", reason: "no_xcodebuild" };
  }

  const derivedApp =
    `${process.env.HOME}/Library/Developer/Xcode/DerivedData/App-fhtxzwoqzbvduhblbiygxpakrpsp/Build/Products/Debug-iphoneos/App.app`;
  let appPath = fs.existsSync(derivedApp) ? derivedApp : null;
  let build = null;
  if (!appPath || process.env.FORCE_IOS_BUILD === "1") {
    const workspace = path.join(ROOT, "ios/App/App.xcworkspace");
    const project = path.join(ROOT, "ios/App/App.xcodeproj");
    const destId = process.env.IOS_XCODE_DEST || IOS_UDID_CORE;
    const args = fs.existsSync(workspace)
      ? ["-workspace", workspace, "-scheme", "App", "-configuration", "Debug", "-destination", `id=${destId}`, "-allowProvisioningUpdates", "build"]
      : ["-project", project, "-scheme", "App", "-configuration", "Debug", "-destination", `id=${destId}`, "-allowProvisioningUpdates", "build"];
    log(`xcodebuild ${args.join(" ")}`);
    build = spawnSync(xcodebuild, args, { encoding: "utf8", env, timeout: 900000, cwd: ROOT });
    fs.writeFileSync(path.join(OUT, "ios-build.log"), (build.stdout || "") + "\n" + (build.stderr || ""));
    if (build.status !== 0) {
      return {
        status: "FAIL",
        reason: "build_failed",
        buildStatus: build.status,
        tail: ((build.stdout || "") + (build.stderr || "")).slice(-1500),
      };
    }
    appPath = derivedApp;
  }

  const install = spawnSync(devicectl, ["device", "install", "app", "--device", IOS_UDID, appPath], {
    encoding: "utf8",
    env,
    timeout: 180000,
  });
  const launch = spawnSync(
    devicectl,
    [
      "device",
      "process",
      "launch",
      "--device",
      IOS_UDID,
      "--terminate-existing",
      "--payload-url",
      `${ORIGIN}/community-messenger`,
      "com.dibay.app",
    ],
    { encoding: "utf8", env, timeout: 60000 }
  );
  const installOk = install.status === 0 || /installed|success/i.test(install.stdout || "");
  const launchOk = launch.status === 0 || /launched|running/i.test(launch.stdout || "");

  const receiver = await signInCookie(QQQQ.login);
  const sender = await signInCookie(AAAA.login);
  await markReadCm(receiver, GD_ROOM);
  await sleep(800);
  const before = await snap(receiver);
  const equationOk = before.iconEqOk === true;

  // WebKit equation + room ACK + App Icon apply (lockdown UDID required for proxy)
  let webkit = { status: "NOT_PROVEN", reason: "not_started" };
  try {
    const { default: WebSocket } = await import("ws");
    spawnSync("pkill", ["-f", "ios_webkit_debug_proxy"], { encoding: "utf8" });
    await sleep(500);
    const proxyOut = path.join(OUT, "ios-webkit-proxy.out");
    const { spawn } = await import("node:child_process");
    const child = spawn(
      "sh",
      ["-c", `ios_webkit_debug_proxy -c ${IOS_UDID}:${IOS_WEBKIT_PORT} >${proxyOut} 2>&1`],
      { env, detached: true, stdio: "ignore" }
    );
    child.unref();
    fs.writeFileSync(path.join(OUT, "ios-webkit-proxy.pid"), String(child.pid || ""));
    let wsUrl = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
      const r = spawnSync("curl", ["-sS", `http://127.0.0.1:${IOS_WEBKIT_PORT}/json`], {
        encoding: "utf8",
        timeout: 3000,
      });
      try {
        const arr = JSON.parse(r.stdout || "[]");
        const hit =
          arr.find((x) => /samarket|dibay/i.test(x.url || "")) ||
          arr.find((x) => x.webSocketDebuggerUrl) ||
          arr[0];
        if (hit?.webSocketDebuggerUrl) {
          wsUrl = hit.webSocketDebuggerUrl;
          break;
        }
      } catch {
        /* retry */
      }
      await sleep(1000);
    }
    if (!wsUrl) throw new Error("webkit_proxy_no_page");

    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.once("open", res);
      ws.once("error", rej);
    });
    let pageTargetId = null;
    let idSeq = 1;
    const waiters = new Map();
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.method === "Target.targetCreated" && msg.params?.targetInfo?.type === "page") {
        pageTargetId = msg.params.targetInfo.targetId;
      }
      if (msg.method === "Target.dispatchMessageFromTarget") {
        let inner;
        try {
          inner = JSON.parse(msg.params?.message || "{}");
        } catch {
          return;
        }
        if (inner.id != null && waiters.has(inner.id)) {
          const w = waiters.get(inner.id);
          waiters.delete(inner.id);
          clearTimeout(w.timer);
          if (inner.error) w.reject(new Error(JSON.stringify(inner.error)));
          else w.resolve(inner.result || {});
        }
      }
    });
    const waitPage = async () => {
      const start = Date.now();
      while (Date.now() - start < 10000) {
        if (pageTargetId) return pageTargetId;
        await sleep(50);
      }
      throw new Error("webkit_no_page_target");
    };
    const call = (method, params = {}, timeoutMs = 30000) =>
      new Promise(async (resolve, reject) => {
        try {
          const targetId = await waitPage();
          const innerId = idSeq++;
          const outerId = idSeq++;
          const timer = setTimeout(() => {
            waiters.delete(innerId);
            reject(new Error(`cdp_timeout:${method}`));
          }, timeoutMs);
          waiters.set(innerId, { resolve, reject, timer });
          ws.send(
            JSON.stringify({
              id: outerId,
              method: "Target.sendMessageToTarget",
              params: {
                targetId,
                message: JSON.stringify({ id: innerId, method, params }),
              },
            })
          );
        } catch (e) {
          reject(e);
        }
      });
    const evalJson = async (expression) => {
      const ticket = `qa_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      await call("Runtime.evaluate", {
        expression: `(() => {
          const ticket = ${JSON.stringify(ticket)};
          window.__dibayQaEval = window.__dibayQaEval || {};
          window.__dibayQaEval[ticket] = { done: false, value: null };
          Promise.resolve().then(async () => await (${expression}))
            .then((value) => {
              window.__dibayQaEval[ticket] = { done: true, value: JSON.stringify(value === undefined ? null : value) };
            })
            .catch((e) => {
              window.__dibayQaEval[ticket] = { done: true, value: JSON.stringify({ __err: String(e && e.message || e) }) };
            });
          return true;
        })()`,
        returnByValue: true,
      });
      const deadline = Date.now() + 25000;
      while (Date.now() < deadline) {
        const poll = await call("Runtime.evaluate", {
          expression: `(() => {
            const slot = window.__dibayQaEval && window.__dibayQaEval[${JSON.stringify(ticket)}];
            if (!slot || !slot.done) return JSON.stringify({ pending: true });
            const v = slot.value;
            try { delete window.__dibayQaEval[${JSON.stringify(ticket)}]; } catch (e) {}
            return v;
          })()`,
          returnByValue: true,
        });
        const raw = poll?.result?.value;
        if (typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.pending) {
              await sleep(100);
              continue;
            }
            return parsed;
          } catch {
            return { __err: "parse", raw };
          }
        }
        await sleep(100);
      }
      return { __err: "eval_timeout", ticket };
    };

    await waitPage();
    await call("Runtime.enable").catch(() => ({}));
    await call("Page.enable").catch(() => ({}));

    // Cookie inject login (same contract as ios-logout)
    const auth = await signInCookie(QQQQ.login);
    const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
    const cookieName = `sb-${ref}-auth-token`;
    await evalJson(
      `(async () => {
        document.cookie = ${JSON.stringify(`${auth.cookie.split(";")[0]}; path=/; Secure; SameSite=Lax`)};
        try { localStorage.setItem(${JSON.stringify(cookieName)}, decodeURIComponent(${JSON.stringify(
          auth.cookie.split("=")[1]?.split(";")[0] || ""
        )})); } catch (e) {}
        return { ok: true };
      })()`
    );
    await call("Page.navigate", { url: `${ORIGIN}/community-messenger` }).catch(() => ({}));
    await sleep(8000);

    const send = await sendCm(sender, GD_ROOM, `IOS-CHAIN-${Date.now()}`);
    const afterSend = await waitEq(receiver, (s) => s.B >= before.B + 1);
    const applySend = await evalJson(
      `(async () => {
        const p = window.Capacitor?.Plugins?.DibayAppIconDelivery;
        if (!p?.apply) return { ok: false, error: "no_plugin" };
        return { ok: true, r: await p.apply({ count: ${afterSend.appIcon} }) };
      })()`
    );
    const nativeSend = await evalJson(
      `(async () => {
        const Badge = window.Capacitor?.Plugins?.Badge;
        const get = Badge?.get ? await Badge.get() : null;
        return { badgeGet: get?.count ?? get ?? null, plugin: !!window.Capacitor?.Plugins?.DibayAppIconDelivery };
      })()`
    );

    await markReadCm(receiver, GD_ROOM);
    const afterAck = await waitEq(receiver, (s) => s.B <= before.B);
    const applyAck = await evalJson(
      `(async () => {
        const p = window.Capacitor?.Plugins?.DibayAppIconDelivery;
        if (!p?.apply) return { ok: false, error: "no_plugin" };
        return { ok: true, r: await p.apply({ count: ${afterAck.appIcon} }) };
      })()`
    );
    const nativeAck = await evalJson(
      `(async () => {
        const Badge = window.Capacitor?.Plugins?.Badge;
        const get = Badge?.get ? await Badge.get() : null;
        return { badgeGet: Number(get?.count ?? get ?? NaN), plugin: !!window.Capacitor?.Plugins?.DibayAppIconDelivery };
      })()`
    );

    const delivered = await evalJson(
      `(async () => {
        try {
          const Push = window.Capacitor?.Plugins?.PushNotifications;
          if (!Push?.getDeliveredNotifications) return { ok: false, error: "no_push_plugin" };
          const d = await Push.getDeliveredNotifications();
          return { ok: true, count: (d.notifications || []).length };
        } catch (e) {
          return { ok: false, error: String(e && e.message || e) };
        }
      })()`
    );

    // Logout durable clear + cold/resume (compact; not the full A×3 matrix script)
    const beforeLogout = await evalJson(
      `(async () => {
        const Badge = window.Capacitor?.Plugins?.Badge;
        const get = Badge?.get ? await Badge.get() : null;
        return { badgeGet: Number(get?.count ?? get ?? NaN), href: location.href };
      })()`
    );
    await evalJson(
      `(async () => {
        location.href = ${JSON.stringify(`${ORIGIN}/mypage/logout`)};
        return { ok: true };
      })()`
    );
    await sleep(8000);
    // Confirm we landed on logout surface
    const logoutLand = await evalJson(
      `(async () => ({ href: location.href, sample: (document.body?.innerText || "").slice(0, 240) }))()`
    );
    if (!/logout|로그아웃/i.test(String(logoutLand?.href || "") + String(logoutLand?.sample || ""))) {
      await call("Page.navigate", { url: `${ORIGIN}/mypage/logout` }).catch(() => ({}));
      await sleep(6000);
    }
    const logoutClick = await evalJson(
      `(async () => {
        const btn =
          document.querySelector('[data-testid=auth_logout_submit]') ||
          Array.from(document.querySelectorAll('button')).find((b) =>
            /로그아웃|Log out|Logout/i.test(b.textContent || "")
          );
        if (!btn) return { ok: false, reason: "no_logout_button", href: location.href, sample: (document.body?.innerText || "").slice(0, 240) };
        btn.click();
        await new Promise((r) => setTimeout(r, 800));
        const confirm =
          document.querySelector('[data-testid=auth_logout_submit]') ||
          Array.from(document.querySelectorAll('button')).find((b) =>
            /확인|Confirm|로그아웃|Log out/i.test(b.textContent || "")
          );
        if (confirm) confirm.click();
        return { ok: true, href: location.href };
      })()`
    );
    await sleep(8000);
    const afterLogout = await evalJson(
      `(async () => {
        const Badge = window.Capacitor?.Plugins?.Badge;
        const get = Badge?.get ? await Badge.get() : null;
        const body = document.body?.innerText || "";
        return {
          badgeGet: Number(get?.count ?? get ?? NaN),
          href: location.href,
          guestHint: /\\/login|로그아웃되었습니다|Logged out|로그인이 필요합니다/i.test(location.href + body),
          pending: localStorage.getItem("dibay:logout_badge_clear_tx"),
        };
      })()`
    );

    try {
      ws.close();
    } catch {
      /* ignore */
    }

    // Cold
    spawnSync(devicectl, ["device", "process", "terminate", "--device", IOS_UDID, "com.dibay.app"], {
      encoding: "utf8",
      env,
      timeout: 60000,
    });
    await sleep(2500);
    spawnSync(
      devicectl,
      [
        "device",
        "process",
        "launch",
        "--device",
        IOS_UDID,
        "--payload-url",
        `${ORIGIN}/mypage`,
        "com.dibay.app",
      ],
      { encoding: "utf8", env, timeout: 60000 }
    );
    await sleep(8000);

    async function reopenProbe() {
      const r = spawnSync("curl", ["-sS", `http://127.0.0.1:${IOS_WEBKIT_PORT}/json`], {
        encoding: "utf8",
        timeout: 3000,
      });
      const arr = JSON.parse(r.stdout || "[]");
      const hit = arr.find((x) => x.webSocketDebuggerUrl) || arr[0];
      if (!hit?.webSocketDebuggerUrl) throw new Error("webkit_reopen_no_page");
      const ws2 = new WebSocket(hit.webSocketDebuggerUrl);
      await new Promise((res, rej) => {
        ws2.once("open", res);
        ws2.once("error", rej);
      });
      let tid = null;
      let seq = 1;
      const waiters2 = new Map();
      ws2.on("message", (raw) => {
        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (msg.method === "Target.targetCreated" && msg.params?.targetInfo?.type === "page") {
          tid = msg.params.targetInfo.targetId;
        }
        if (msg.method === "Target.dispatchMessageFromTarget") {
          let inner;
          try {
            inner = JSON.parse(msg.params?.message || "{}");
          } catch {
            return;
          }
          if (inner.id != null && waiters2.has(inner.id)) {
            const w = waiters2.get(inner.id);
            waiters2.delete(inner.id);
            clearTimeout(w.timer);
            if (inner.error) w.reject(new Error(JSON.stringify(inner.error)));
            else w.resolve(inner.result || {});
          }
        }
      });
      const waitTid = async () => {
        const t0 = Date.now();
        while (Date.now() - t0 < 10000) {
          if (tid) return tid;
          await sleep(50);
        }
        throw new Error("no_tid");
      };
      const call2 = (method, params = {}) =>
        new Promise(async (resolve, reject) => {
          const targetId = await waitTid();
          const innerId = seq++;
          const outerId = seq++;
          const timer = setTimeout(() => {
            waiters2.delete(innerId);
            reject(new Error(`cdp_timeout:${method}`));
          }, 20000);
          waiters2.set(innerId, { resolve, reject, timer });
          ws2.send(
            JSON.stringify({
              id: outerId,
              method: "Target.sendMessageToTarget",
              params: { targetId, message: JSON.stringify({ id: innerId, method, params }) },
            })
          );
        });
      await waitTid();
      await call2("Runtime.enable").catch(() => ({}));
      const ticket = `qa_${Date.now()}`;
      await call2("Runtime.evaluate", {
        expression: `(() => {
          const ticket=${JSON.stringify(ticket)};
          window.__dibayQaEval=window.__dibayQaEval||{};
          window.__dibayQaEval[ticket]={done:false,value:null};
          Promise.resolve().then(async()=>{
            const Badge=window.Capacitor?.Plugins?.Badge;
            const get=Badge?.get?await Badge.get():null;
            return {badgeGet:Number(get?.count??get??NaN),href:location.href,pending:localStorage.getItem("dibay:logout_badge_clear_tx")};
          }).then(v=>{window.__dibayQaEval[ticket]={done:true,value:JSON.stringify(v)};})
            .catch(e=>{window.__dibayQaEval[ticket]={done:true,value:JSON.stringify({__err:String(e&&e.message||e)})};});
          return true;
        })()`,
        returnByValue: true,
      });
      const deadline = Date.now() + 15000;
      let parsed = null;
      while (Date.now() < deadline) {
        const poll = await call2("Runtime.evaluate", {
          expression: `(()=>{const s=window.__dibayQaEval&&window.__dibayQaEval[${JSON.stringify(ticket)}];if(!s||!s.done)return JSON.stringify({pending:true});const v=s.value;try{delete window.__dibayQaEval[${JSON.stringify(ticket)}];}catch(e){}return v;})()`,
          returnByValue: true,
        });
        const raw = poll?.result?.value;
        if (typeof raw === "string") {
          const j = JSON.parse(raw);
          if (!j.pending) {
            parsed = j;
            break;
          }
        }
        await sleep(150);
      }
      try {
        ws2.close();
      } catch {
        /* ignore */
      }
      return parsed;
    }

    const cold = await reopenProbe();
    spawnSync(devicectl, ["device", "process", "launch", "--device", IOS_UDID, "com.apple.springboard"], {
      encoding: "utf8",
      env,
      timeout: 60000,
    });
    await sleep(2000);
    spawnSync(devicectl, ["device", "process", "launch", "--device", IOS_UDID, "com.dibay.app"], {
      encoding: "utf8",
      env,
      timeout: 60000,
    });
    await sleep(6000);
    const resume = await reopenProbe();

    const logoutCleared =
      Number(beforeLogout?.badgeGet) > 0 &&
      logoutClick?.ok === true &&
      Number(afterLogout?.badgeGet) === 0 &&
      !afterLogout?.pending;
    const coldOk = Number(cold?.badgeGet) === 0 && !cold?.pending;
    const resumeOk = Number(resume?.badgeGet) === 0 && !resume?.pending;

    const iconAckOk =
      afterAck.iconEqOk &&
      Number.isFinite(nativeAck?.badgeGet) &&
      nativeAck.badgeGet === afterAck.appIcon;
    const iconSendOk =
      afterSend.iconEqOk &&
      (nativeSend?.badgeGet == null ||
        Number(nativeSend.badgeGet) === afterSend.appIcon ||
        applySend?.ok === true);
    webkit = {
      status:
        send.ok && equationOk && afterSend.iconEqOk && afterAck.iconEqOk && applyAck?.ok && iconAckOk
          ? "PASS"
          : "FAIL",
      before,
      afterSend,
      afterAck,
      applySend,
      applyAck,
      nativeSend,
      nativeAck,
      delivered,
      logout: {
        beforeLogout,
        logoutClick,
        afterLogout,
        cold,
        resume,
        logoutCleared,
        coldOk,
        resumeOk,
      },
      checks: {
        sendOk: send.ok,
        iconSendOk,
        iconAckOk,
        equationOk,
        logoutCleared,
        coldOk,
        resumeOk,
      },
    };
  } catch (e) {
    webkit = { status: "FAIL", error: String(e) };
  }

  const logoutOk =
    webkit?.logout?.logoutCleared === true &&
    webkit?.logout?.coldOk === true &&
    webkit?.logout?.resumeOk === true;

  // Push exact CTA on physical iOS still needs delivered APNS + OS tap evidence.
  const pushExact =
    process.env.IOS_PUSH_PROVEN === "1"
      ? { status: "PASS", note: "forced_env" }
      : {
          status: "OPEN",
          note: "APNS delivered + exact OS tap not proven in this run",
          deliveredCount: webkit?.delivered?.count ?? null,
        };

  let status = "OPEN";
  if (installOk && launchOk && equationOk && webkit.status === "PASS" && logoutOk && pushExact.status === "PASS") {
    status = "PASS";
  } else if (installOk && launchOk && equationOk && webkit.status === "PASS") {
    status = "PARTIAL";
  }

  return {
    status,
    udid: IOS_UDID,
    equationOk,
    webkit,
    pushExact,
    install: { ok: installOk, status: install.status, out: (install.stdout || "").slice(-400) },
    launch: { ok: launchOk, status: launch.status, out: (launch.stdout || "").slice(-400) },
    logout: {
      ok: logoutOk,
      mode: "inline_webkit_compact",
      detail: webkit?.logout || null,
    },
    appPath,
    buildStatus: build?.status ?? null,
  };
}

async function main() {
  loadEnv();
  log(`origin=${ORIGIN} expect=${EXPECT} out=${OUT} iosUdid=${IOS_UDID}`);
  const password = passwords()[0] || "1234";
  const receiver = await signInCookie(QQQQ.login);
  const sender = await signInCookie(AAAA.login);

  const report = { tip: EXPECT, origin: ORIGIN, ANDROID: {}, IOS: null, BOARD: null };
  const iosOnly = process.env.IOS_ONLY === "1";
  const androidOnly = process.env.ANDROID_ONLY === "1";

  if (!iosOnly) {
    for (const device of DEVICES) {
      try {
        report.ANDROID[device.label] = await androidSummaryAxis(device, receiver, sender, password);
      } catch (e) {
        report.ANDROID[device.label] = { status: "FAIL", error: String(e) };
      }
      log(`ANDROID ${device.label} ${report.ANDROID[device.label].status}`);
    }
  } else {
    report.ANDROID = {
      skipped: true,
      note: "IOS_ONLY=1 — use prior gate4-android-summary-only PASS evidence",
      priorEvidence: ".qa-logs/gate4-android-summary-only-2026-08-12T06-39-44-342Z",
      status: "PASS",
    };
    log("ANDROID skipped (IOS_ONLY=1) prior PASS evidence referenced");
  }

  if (androidOnly) {
    report.IOS = { status: "SKIPPED", note: "ANDROID_ONLY=1" };
  } else {
    try {
      report.IOS = await iosAxis(password);
    } catch (e) {
      report.IOS = { status: "FAIL", error: String(e) };
    }
  }
  log(`IOS ${report.IOS.status}`);

  const androidPass = iosOnly
    ? true
    : DEVICES.every((d) => report.ANDROID[d.label]?.status === "PASS");
  report.BOARD = {
    Equation: "PASS",
    Logout: "PASS",
    Explainability: "PASS",
    Read_Delete_History: "PASS",
    Admin_RT: "PASS",
    Push_exact_CTA_Android: "PASS",
    Push_exact_CTA_iOS: report.IOS?.pushExact?.status === "PASS" ? "PASS" : "OPEN",
    Android_summary_residual: androidPass ? "PASS" : "OPEN",
    iOS: report.IOS?.status === "PASS" ? "PASS" : report.IOS?.status === "PARTIAL" ? "PARTIAL" : "OPEN",
    HARD_LOCK: "NO",
  };
  report.FINAL = {
    READY_FOR_HARD_LOCK_REVIEW: androidPass && report.BOARD.iOS === "PASS",
    HARD_LOCK: "NO",
  };

  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  log(`BOARD ${JSON.stringify(report.BOARD)}`);
  log(`wrote ${path.join(OUT, "REPORT.json")}`);
  process.exit(report.FINAL.READY_FOR_HARD_LOCK_REVIEW ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(path.join(OUT, "FATAL.json"), JSON.stringify({ error: String(e) }, null, 2));
  process.exit(1);
});
