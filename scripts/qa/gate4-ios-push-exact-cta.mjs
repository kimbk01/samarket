#!/usr/bin/env node
/**
 * iOS Push exact OS tap → exact CTA (iPhone Mirroring click + Cap actionPerformed).
 *
 *   DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
 *   GATE4_ORIGIN=https://samarket.vercel.app \
 *     node scripts/qa/gate4-ios-push-exact-cta.mjs
 *
 * Exact OS tap = notification banner tap via iPhone Mirroring coordinates
 * (not deep-link fallback). CTA = room path after tap.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/gate4-ios-push-exact-cta-${STAMP}`);
fs.mkdirSync(OUT, { recursive: true });

const ORIGIN = (process.env.GATE4_ORIGIN || "https://samarket.vercel.app").replace(/\/$/, "");
const DEVELOPER_DIR =
  process.env.DEVELOPER_DIR || "/Applications/Xcode.app/Contents/Developer";
const IOS_UDID =
  process.env.IOS_UDID ||
  process.env.IOS_UDID_LOCKDOWN ||
  "00008120-000025C826F3C01E";
const PROXY_PORT = Number(process.env.IOS_WEBKIT_PORT || 9222);
const GD_ROOM = process.env.P0_DIRECT_ROOM || "b19e2672-f26f-4a2e-8125-52575da4a62a";
const QQQQ = { login: "qqqq", userId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8" };

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
function log(line) {
  const msg = `[ios-push-cta] ${line}`;
  console.log(msg);
  fs.appendFileSync(path.join(OUT, "run.log"), msg + "\n");
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function n(v) {
  return Math.max(0, Math.floor(Number(v) || 0));
}
function deviceEnv() {
  return {
    ...process.env,
    DEVELOPER_DIR,
    PATH: `${DEVELOPER_DIR}/usr/bin:${process.env.PATH || ""}`,
  };
}
function deviceCtl(...args) {
  return spawnSync("devicectl", args, {
    encoding: "utf8",
    env: deviceEnv(),
    timeout: 90000,
  });
}
function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.BADGE_NATIVE_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
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
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    if (pr?.active_session_id) {
      cookie += `; samarket_active_session_id=${encodeURIComponent(pr.active_session_id)}`;
    }
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
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function eq(b) {
  const A = n(b?.memberUnreadNotificationCount ?? b?.projection?.bellTotal);
  const B = n(b?.memberConversationUnreadRooms ?? b?.memberUnreadRoomCount);
  const appIcon = n(b?.memberAppIconAuthority?.appIconTotal ?? b?.projection?.appIconTotal);
  return { A, B, appIcon, iconEqOk: appIcon === A + B };
}

async function snap(auth) {
  const r = await api("/api/me/notifications/badge-count?fresh=1", auth);
  return { status: r.status, ...eq(r.json) };
}

async function waitEq(auth, pred, timeoutMs = 25000) {
  const t0 = Date.now();
  let last = await snap(auth);
  while (Date.now() - t0 < timeoutMs) {
    if (pred(last)) return last;
    await sleep(700);
    last = await snap(auth);
  }
  return last;
}

async function markReadCm(auth, roomId) {
  return api(`/api/community-messenger/rooms/${roomId}`, auth, {
    method: "PATCH",
    body: JSON.stringify({ action: "mark_read", flushOpen: true }),
  });
}

async function sendCm(auth, roomId, content) {
  return api(`/api/community-messenger/rooms/${roomId}/messages`, auth, {
    method: "POST",
    body: JSON.stringify({ content, clientMessageId: `ios-push-${Date.now()}` }),
  });
}

function ensureProxy() {
  const check = spawnSync("curl", ["-sS", `http://127.0.0.1:${PROXY_PORT}/json`], {
    encoding: "utf8",
    timeout: 3000,
  });
  if ((check.stdout || "").includes("webSocketDebuggerUrl")) return;
  spawnSync("pkill", ["-f", "ios_webkit_debug_proxy"], { encoding: "utf8" });
  const out = path.join(OUT, "webkit-proxy.out");
  const child = spawn(
    "sh",
    ["-c", `ios_webkit_debug_proxy -c ${IOS_UDID}:${PROXY_PORT} >${out} 2>&1`],
    { env: deviceEnv(), detached: true, stdio: "ignore" }
  );
  child.unref();
  fs.writeFileSync(path.join(OUT, "webkit-proxy.pid"), String(child.pid || ""));
}

async function waitProxyWs(timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    ensureProxy();
    const r = spawnSync("curl", ["-sS", `http://127.0.0.1:${PROXY_PORT}/json`], {
      encoding: "utf8",
      timeout: 3000,
    });
    try {
      const arr = JSON.parse(r.stdout || "[]");
      const hit =
        arr.find((x) => /samarket|dibay/i.test(x.url || "")) ||
        arr.find((x) => x.webSocketDebuggerUrl) ||
        arr[0];
      if (hit?.webSocketDebuggerUrl) return hit.webSocketDebuggerUrl;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  throw new Error("webkit_proxy_no_page");
}

function createCdpSession(ws) {
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
    if (msg.method === "Target.targetInfoChanged" && msg.params?.targetInfo?.type === "page") {
      pageTargetId = msg.params.targetInfo.targetId;
    }
    if (msg.id != null && msg.result?.targetInfos) {
      const page = (msg.result.targetInfos || []).find((t) => t.type === "page");
      if (page?.targetId) pageTargetId = page.targetId;
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
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
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
  return { call, evalJson, waitPage };
}

async function openSession() {
  const wsUrl = await waitProxyWs();
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.once("open", res);
    ws.once("error", rej);
  });
  const session = createCdpSession(ws);
  // iOS WebKit often needs explicit target discovery before targetCreated fires.
  ws.send(JSON.stringify({ id: 900001, method: "Target.setDiscoverTargets", params: { discover: true } }));
  ws.send(
    JSON.stringify({
      id: 900002,
      method: "Target.setAutoAttach",
      params: { autoAttach: true, waitForDebuggerOnStart: false, flatten: false },
    })
  );
  ws.send(JSON.stringify({ id: 900003, method: "Target.getTargets", params: {} }));
  await sleep(500);
  try {
    await session.waitPage();
  } catch {
    // Fallback: ask for targets explicitly via outer evaluate is unavailable; retry wait
    await sleep(1000);
    await session.waitPage();
  }
  await session.call("Runtime.enable").catch(() => ({}));
  await session.call("Page.enable").catch(() => ({}));
  return { ws, ...session };
}

function mirroringGeometry() {
  const r = spawnSync(
    "osascript",
    [
      "-e",
      'tell application "System Events" to tell process "iPhone Mirroring" to get {position, size} of window 1',
    ],
    { encoding: "utf8", timeout: 10000 }
  );
  const raw = (r.stdout || "").trim();
  // "x, y, w, h" or "x, y, w, h\n"
  const nums = raw.split(/[,\s]+/).map(Number).filter((x) => Number.isFinite(x));
  if (nums.length < 4) return { ok: false, raw, err: r.stderr };
  return { ok: true, x: nums[0], y: nums[1], w: nums[2], h: nums[3], raw };
}

function clickScreen(x, y) {
  // Prefer osascript System Events click (works without PyObjC Quartz).
  const osa = spawnSync(
    "osascript",
    ["-e", `tell application "System Events" to click at {${Number(x)}, ${Number(y)}}`],
    { encoding: "utf8", timeout: 10000 }
  );
  if (osa.status === 0) {
    return { status: 0, out: `osascript_click ${x},${y} ${(osa.stdout || "").trim()}`, err: "" };
  }
  // Fallback: Swift CoreGraphics
  const sw = `
import CoreGraphics
import Foundation
let x = CGFloat(${Number(x)})
let y = CGFloat(${Number(y)})
let pt = CGPoint(x: x, y: y)
if let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: pt, mouseButton: .left) {
  move.post(tap: .cghidEventTap)
}
if let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: pt, mouseButton: .left) {
  down.post(tap: .cghidEventTap)
}
if let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: pt, mouseButton: .left) {
  up.post(tap: .cghidEventTap)
}
print("swift_clicked \\(Int(x)),\\(Int(y))")
`;
  const r = spawnSync("swift", ["-e", sw], { encoding: "utf8", timeout: 30000 });
  return {
    status: r.status,
    out: (r.stdout || "").trim() || `osascript_fail ${(osa.stderr || "").trim()}`,
    err: (r.stderr || "").trim(),
  };
}

function bringMirroringFront() {
  spawnSync("open", ["-a", "iPhone Mirroring"], { encoding: "utf8" });
  spawnSync(
    "osascript",
    [
      "-e",
      'tell application "System Events" to tell process "iPhone Mirroring" to set frontmost to true',
      "-e",
      'tell application "System Events" to tell process "iPhone Mirroring" to try\nset position of window 1 to {100, 80}\nend try',
    ],
    { encoding: "utf8", timeout: 10000 }
  );
}

async function main() {
  loadEnv();
  log(`origin=${ORIGIN} udid=${IOS_UDID} out=${OUT}`);

  deviceCtl(
    "device",
    "process",
    "launch",
    "--device",
    IOS_UDID,
    "--terminate-existing",
    "--payload-url",
    `${ORIGIN}/community-messenger`,
    "com.dibay.app"
  );
  await sleep(5000);
  ensureProxy();

  const receiver = await signInCookie(QQQQ.login);
  const sender = await signInCookie("aaaa");
  await markReadCm(receiver, GD_ROOM);
  await sleep(800);
  const before = await snap(receiver);

  let session = await openSession();
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const cookieName = `sb-${ref}-auth-token`;
  const cookiePart = receiver.cookie.split(";")[0];
  await session.evalJson(
    `(async () => {
      document.cookie = ${JSON.stringify(`${cookiePart}; path=/; Secure; SameSite=Lax`)};
      try {
        const v = ${JSON.stringify(cookiePart.split("=").slice(1).join("="))};
        localStorage.setItem(${JSON.stringify(cookieName)}, decodeURIComponent(v));
      } catch (e) {}
      return { ok: true };
    })()`
  );
  await session.call("Page.navigate", { url: `${ORIGIN}/community-messenger` }).catch(() => ({}));
  await sleep(7000);

  const reg = await session.evalJson(
    `(async () => {
      const Push = window.Capacitor?.Plugins?.PushNotifications;
      if (!Push) return { ok: false, error: "no_push_plugin" };
      window.__dibayPushTap = null;
      window.__dibayPushReceived = [];
      try { await Push.requestPermissions(); } catch (e) {}
      try { await Push.removeAllListeners(); } catch (e) {}
      let token = null;
      let regErr = null;
      await Push.addListener("registration", (t) => { token = t?.value || t; });
      await Push.addListener("registrationError", (e) => { regErr = e; });
      await Push.addListener("pushNotificationReceived", (n) => {
        window.__dibayPushReceived.push(n);
      });
      await Push.addListener("pushNotificationActionPerformed", (action) => {
        window.__dibayPushTap = {
          at: Date.now(),
          actionId: action?.actionId || null,
          notification: action?.notification || null,
          href: location.href,
        };
      });
      await Push.register();
      const t0 = Date.now();
      while (Date.now() - t0 < 15000) {
        if (token || regErr) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!token) {
        return { ok: false, error: "no_token", regErr };
      }
      // Persist to user_devices (product path) — Cap register alone is not enough for dispatch.
      let deviceId = localStorage.getItem("dibay_client_instance_id") || localStorage.getItem("samarket_client_instance_id");
      if (!deviceId) {
        deviceId = (crypto.randomUUID && crypto.randomUUID()) || ("ios-qa-" + Date.now());
        try { localStorage.setItem("dibay_client_instance_id", deviceId); } catch (e) {}
      }
      const body = {
        platform: "ios",
        push_provider: "apns",
        device_id: deviceId,
        push_token: token,
        user_id: ${JSON.stringify(QQQQ.userId)},
      };
      const res = await fetch("/api/me/devices/register", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      let delivered = null;
      try {
        delivered = await Push.getDeliveredNotifications();
      } catch (e) {
        delivered = { error: String(e && e.message || e) };
      }
      return {
        ok: res.ok && (json.ok !== false),
        tokenLen: (token || "").length,
        regErr,
        registerHttp: res.status,
        registerJson: json,
        deviceId,
        deliveredBefore: Array.isArray(delivered?.notifications) ? delivered.notifications.length : delivered,
        platform: window.Capacitor?.getPlatform?.(),
      };
    })()`
  );
  log(`register ${JSON.stringify(reg)}`);

  const geoBefore = mirroringGeometry();
  fs.writeFileSync(path.join(OUT, "mirroring-geo.json"), JSON.stringify(geoBefore, null, 2));
  log(`mirroring ${JSON.stringify(geoBefore)}`);

  // Background app so banner can show
  deviceCtl("device", "process", "launch", "--device", IOS_UDID, "com.apple.springboard");
  await sleep(2000);
  // Keep only iPhone Mirroring front — avoid clicking Cursor/Xcode by accident.
  spawnSync(
    "osascript",
    [
      "-e",
      'tell application "System Events"\ntry\nset visible of process "Cursor" to false\nend try\ntry\nset visible of process "Xcode" to false\nend try\nend tell',
    ],
    { encoding: "utf8", timeout: 10000 }
  );
  bringMirroringFront();
  await sleep(1000);

  const send = await sendCm(sender, GD_ROOM, `IOS-PUSH-CTA-${Date.now()}`);
  const afterSend = await waitEq(receiver, (s) => s.B >= before.B + 1, 25000);
  log(`send ok=${send.ok} B ${before.B}->${afterSend.B}`);
  // Wait longer for APNS after fresh device register
  await sleep(8000);

  bringMirroringFront();
  const geo = mirroringGeometry();
  // Banner sits near top-center of the mirrored phone frame
  const tapPoints = [];
  if (geo.ok) {
    const cx = Math.round(geo.x + geo.w * 0.5);
    // Several Y positions: Dynamic Island / banner band
    for (const frac of [0.06, 0.09, 0.12, 0.16, 0.22]) {
      tapPoints.push({ x: cx, y: Math.round(geo.y + geo.h * frac), frac });
    }
  }
  const clicks = [];
  for (const p of tapPoints) {
    const c = clickScreen(p.x, p.y);
    clicks.push({ ...p, ...c });
    log(`click ${p.x},${p.y} -> ${c.out || c.err}`);
    await sleep(1200);
  }
  // Extra: pull notification center (swipe down from top) via Swift CoreGraphics
  if (geo.ok) {
    const x0 = Math.round(geo.x + geo.w * 0.5);
    const y0 = Math.round(geo.y + geo.h * 0.02);
    const y1 = Math.round(geo.y + geo.h * 0.35);
    const swipeSwift = `
import CoreGraphics
import Foundation
let x0 = CGFloat(${x0})
let y0 = CGFloat(${y0})
let y1 = CGFloat(${y1})
let start = CGPoint(x: x0, y: y0)
if let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: start, mouseButton: .left) {
  down.post(tap: .cghidEventTap)
}
for i in 1...12 {
  let t = CGFloat(i) / 12.0
  let p = CGPoint(x: x0, y: y0 + (y1 - y0) * t)
  if let drag = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: p, mouseButton: .left) {
    drag.post(tap: .cghidEventTap)
  }
  Thread.sleep(forTimeInterval: 0.02)
}
let end = CGPoint(x: x0, y: y1)
if let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: end, mouseButton: .left) {
  up.post(tap: .cghidEventTap)
}
print("swiped_nc")
`;
    const swipe = spawnSync("swift", ["-e", swipeSwift], { encoding: "utf8", timeout: 30000 });
    log(`swipe ${swipe.stdout || swipe.stderr}`);
    await sleep(1500);
    // Tap first notification row in NC (upper third)
    const ncTap = clickScreen(
      Math.round(geo.x + geo.w * 0.5),
      Math.round(geo.y + geo.h * 0.18)
    );
    clicks.push({ kind: "nc_row", ...ncTap });
    log(`nc_row_tap ${ncTap.out || ncTap.err}`);
    await sleep(3500);
  }

  // Reconnect CDP after possible notification-driven foreground.
  // DO NOT force-launch a path here — that would fake CTA and invalidate exactOsTap.
  try {
    session.ws.close();
  } catch {
    /* ignore */
  }
  await sleep(4000);
  ensureProxy();
  let afterTap = null;
  try {
    session = await openSession();
    afterTap = await session.evalJson(
      `(async () => {
        const Push = window.Capacitor?.Plugins?.PushNotifications;
        let delivered = null;
        try { delivered = await Push?.getDeliveredNotifications?.(); } catch (e) {
          delivered = { error: String(e && e.message || e) };
        }
        return {
          href: location.href,
          pathname: location.pathname,
          pushTap: window.__dibayPushTap || null,
          pushReceived: window.__dibayPushReceived || [],
          deliveredCount: Array.isArray(delivered?.notifications) ? delivered.notifications.length : delivered,
          sample: (document.body && document.body.innerText || "").slice(0, 200),
        };
      })()`
    );
  } catch (e) {
    afterTap = { error: String(e), note: "cdp_reconnect_failed_after_tap_attempt" };
    // Last resort: launch without path override only to inspect state (not counted as OS tap CTA)
    deviceCtl("device", "process", "launch", "--device", IOS_UDID, "com.dibay.app");
    await sleep(5000);
    ensureProxy();
    try {
      session = await openSession();
      afterTap = {
        ...afterTap,
        inspect: await session.evalJson(
          `(async () => ({ href: location.href, pathname: location.pathname, pushTap: window.__dibayPushTap || null }))()`
        ),
      };
    } catch (e2) {
      afterTap = { ...afterTap, inspectError: String(e2) };
    }
  }

  // If still not on room, check whether tap landed us already via launch — probe without deep link
  const exactPath =
    typeof afterTap?.pathname === "string" &&
    afterTap.pathname.includes(`/community-messenger/rooms/${GD_ROOM}`);
  const actionPerformed = !!afterTap?.pushTap;
  // Exact OS tap requires either Cap actionPerformed from banner/NC tap, or room route
  // without us issuing deep-link fallback. We never issued deep-link in this script.
  const exactOsTap = actionPerformed || exactPath;

  await markReadCm(receiver, GD_ROOM);
  const afterAck = await waitEq(receiver, (s) => s.B <= before.B, 20000);

  const bPlus = afterSend.B >= before.B + 1;
  const aFlat = afterSend.A === before.A;
  const iconOk = afterSend.iconEqOk && afterAck.iconEqOk;
  const readBack = afterAck.B <= before.B;
  const tokenReady = reg?.ok === true;

  let status = "FAIL";
  if (tokenReady && bPlus && aFlat && iconOk && readBack && exactOsTap) status = "PASS";
  else if (tokenReady && bPlus && aFlat && iconOk) status = "PARTIAL";
  else if (bPlus && aFlat) status = "PARTIAL";

  const report = {
    out: OUT,
    origin: ORIGIN,
    udid: IOS_UDID,
    status,
    before,
    afterSend,
    afterAck,
    register: reg,
    sendOk: send.ok,
    mirroring: geo,
    clicks,
    afterTap,
    checks: {
      tokenReady,
      bPlus,
      aFlat,
      iconOk,
      readBack,
      exactOsTap,
      actionPerformed,
      exactPath,
    },
    BOARD: {
      Push_exact_CTA_iOS: status === "PASS" ? "PASS" : status === "PARTIAL" ? "PARTIAL" : "OPEN",
      HARD_LOCK: "NO",
    },
  };
  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  log(`STATUS ${status}`);
  log(`BOARD ${JSON.stringify(report.BOARD)}`);
  log(`wrote ${path.join(OUT, "REPORT.json")}`);
  process.exit(status === "PASS" ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(path.join(OUT, "FATAL.json"), JSON.stringify({ error: String(e) }, null, 2));
  process.exit(1);
});
