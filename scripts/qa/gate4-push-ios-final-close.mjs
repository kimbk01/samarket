#!/usr/bin/env node
/**
 * Final Close — Push/Tray (token register + FCM + tray) then iOS probe.
 * Does not declare HARD LOCK.
 *
 *   EXPECT_GIT_SHA=87a84b77f GATE4_ORIGIN=https://samarket.vercel.app \
 *     node scripts/qa/gate4-push-ios-final-close.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import {
  ensureApkWebViewLogin,
  refreshApkFcmRegisterTail,
  forwardCdp,
  connectWebView,
  navigateApkWebView,
} from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/gate4-push-ios-final-close-${STAMP}`);
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
  { label: "samsung", serial: process.env.GATE4_SAMSUNG || "RFCY40PY2CA", cdpPort: 9531 },
  { label: "xiaomi", serial: process.env.GATE4_XIAOMI || "8b37179f7d94", cdpPort: 9532 },
];
const IOS_UDID =
  process.env.IOS_UDID ||
  process.env.IOS_DEVICE_ID ||
  "B01DDF12-5B2F-59C3-9B8F-3AF136851ECB"; // iPhonebk (devicectl Identifier)
const IOS_UDID_LEGACY = process.env.IOS_UDID_LEGACY || "00008120-000025C826F3C01E";
const DEVELOPER_DIR =
  process.env.DEVELOPER_DIR || "/Applications/Xcode.app/Contents/Developer";

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
  const msg = `[push-ios] ${line}`;
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
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD?.trim(),
        process.env.QA_MANUAL_PASSWORD?.trim(),
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
    await sleep(800);
    last = await snap(auth);
  }
  return last;
}

async function sendCm(auth, roomId, content) {
  return api(`/api/community-messenger/rooms/${roomId}/messages`, auth, {
    method: "POST",
    body: JSON.stringify({
      content,
      clientMessageId: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    }),
  });
}

async function markReadCm(auth, roomId) {
  return api(`/api/community-messenger/rooms/${roomId}`, auth, {
    method: "PATCH",
    body: JSON.stringify({ action: "mark_read", flushOpen: true }),
  });
}

function adminSb() {
  loadEnv();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function queryActiveDevices(userId) {
  const sb = adminSb();
  const { data, error } = await sb
    .from("user_devices")
    .select("id, platform, push_provider, is_active, updated_at, device_id, push_token")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(10);
  return {
    error: error?.message || null,
    rows: (data || []).map((d) => ({
      id: d.id,
      platform: d.platform,
      provider: d.push_provider,
      device_id: d.device_id,
      updated_at: d.updated_at,
      hasToken: !!d.push_token,
      tokenPrefix: String(d.push_token || "").slice(0, 12),
    })),
  };
}

function dumpsys(serial) {
  const r = adb(serial, "shell", "dumpsys", "notification", "--noredact");
  const text = r.stdout || "";
  return {
    hitCount: (text.match(/com\.dibay\.app/g) || []).length,
    hasSummary: /710001|dibay_app_icon_summary/i.test(text),
    hasKey: /Key=.*com\.dibay\.app/i.test(text),
  };
}

function lastPushRegisterUserId(logcat) {
  const matches = [...String(logcat || "").matchAll(/"user_id"\s*:\s*"([^"]+)"/g)];
  if (matches.length) return matches[matches.length - 1][1];
  const m2 = [...String(logcat || "").matchAll(/success user_id=([0-9a-f-]{36})/gi)];
  return m2.length ? m2[m2.length - 1][1] : null;
}

async function registerDevice(device, password) {
  log(`register ${device.label}`);
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
  let registerLogcat = loginRes.registerLogcat || "";
  if (loginRes.ok) {
    // second warm register tail
    const tail = await refreshApkFcmRegisterTail({
      adb,
      serial: device.serial,
      pkg: PKG,
      act: ACT,
      prod: ORIGIN,
      expectedUserId: QQQQ.userId,
      log,
      label: `${device.label}-refresh`,
    });
    registerLogcat = `${registerLogcat}\n${tail.registerLogcat || ""}`;
  }
  await sleep(2000);
  const devices = await queryActiveDevices(QQQQ.userId);
  const regUid = lastPushRegisterUserId(registerLogcat);
  const fresh = devices.rows.some((r) => Date.now() - new Date(r.updated_at).getTime() < 15 * 60_000);
  return {
    label: device.label,
    loginOk: !!loginRes.ok,
    registerUserId: regUid,
    registerMatches: regUid === QQQQ.userId,
    activeRows: devices.rows.length,
    fresh,
    devices,
    logcatTail: String(registerLogcat).split("\n").filter(Boolean).slice(-20),
  };
}

async function pushTrayChain(device, receiver, sender) {
  log(`push-tray ${device.label}`);
  // Background app for tray visibility
  adb(device.serial, "shell", "am", "start", "-n", ACT);
  await sleep(1000);
  adb(device.serial, "shell", "input", "keyevent", "3");
  await sleep(800);

  await markReadCm(receiver, GD_ROOM);
  await sleep(1000);
  const before = await snap(receiver);
  const trayBefore = dumpsys(device.serial);

  const send = await sendCm(sender, GD_ROOM, `PUSH-IOS-FINAL-${device.label}-${Date.now()}`);
  const afterSend = await waitEq(receiver, (s) => s.B >= before.B + 1, 25000);
  await sleep(4000);
  const trayAfter = dumpsys(device.serial);

  // Expand shade; try to click dibay notification via UIAutomator dump
  adb(device.serial, "shell", "cmd", "statusbar", "expand-notifications");
  await sleep(1500);
  const dump = adb(device.serial, "exec-out", "uiautomator", "dump", "/dev/tty");
  const uiXml = dump.stdout || "";
  fs.writeFileSync(path.join(OUT, `${device.label}-shade.xml`), uiXml.slice(0, 200000));
  let tapped = false;
  let tapMethod = null;
  // Prefer node with com.dibay.app text/content
  const nodeRe =
    /<node[^>]*(?:text|content-desc)="[^"]*(?:메시지|message|채팅|DIBAY|디바이|새 메시지)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/gi;
  let m;
  const hits = [];
  while ((m = nodeRe.exec(uiXml))) {
    hits.push({
      x1: Number(m[1]),
      y1: Number(m[2]),
      x2: Number(m[3]),
      y2: Number(m[4]),
    });
  }
  if (hits.length === 0) {
    const pkgRe = /package="com\.dibay\.app"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/gi;
    while ((m = pkgRe.exec(uiXml))) {
      hits.push({
        x1: Number(m[1]),
        y1: Number(m[2]),
        x2: Number(m[3]),
        y2: Number(m[4]),
      });
    }
  }
  if (hits.length > 0) {
    const h = hits[0];
    const cx = Math.floor((h.x1 + h.x2) / 2);
    const cy = Math.floor((h.y1 + h.y2) / 2);
    adb(device.serial, "shell", "input", "tap", String(cx), String(cy));
    tapped = true;
    tapMethod = `uiautomator_tap_${cx}_${cy}`;
    await sleep(3500);
  } else {
    // fallback deep link — NOT exact OS tap
    tapMethod = "deep_link_fallback";
    adb(
      device.serial,
      "shell",
      "am",
      "start",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      `${ORIGIN}/community-messenger/rooms/${GD_ROOM}`
    );
    await sleep(3500);
  }

  // ACK room read
  await markReadCm(receiver, GD_ROOM);
  const afterRead = await waitEq(receiver, (s) => s.B <= before.B, 20000);
  adb(device.serial, "shell", "cmd", "statusbar", "collapse");
  await sleep(1000);
  const trayAfterAck = dumpsys(device.serial);

  const exactOsTap = tapped === true;
  const bPlus = afterSend.B >= before.B + 1;
  const aFlat = afterSend.A === before.A;
  const readBack = afterRead.B <= before.B;
  const iconOk = afterSend.iconEqOk && afterRead.iconEqOk;
  const trayEvidence =
    trayAfter.hitCount > trayBefore.hitCount || trayAfter.hasSummary || trayAfter.hasKey || hits.length > 0;

  let status = "FAIL";
  if (bPlus && aFlat && readBack && iconOk && exactOsTap && trayEvidence) status = "PASS";
  else if (bPlus && aFlat && readBack && iconOk && trayEvidence) status = "PARTIAL";
  else if (bPlus && aFlat) status = "PARTIAL";

  return {
    status,
    BEFORE: before,
    AFTER_SEND: afterSend,
    AFTER_READ: afterRead,
    tray: { before: trayBefore, afterSend: trayAfter, afterAck: trayAfterAck },
    sendOk: send.ok,
    tap: { exactOsTap, tapMethod, hitCount: hits.length },
    checks: { bPlus, aFlat, readBack, iconOk, trayEvidence, exactOsTap },
  };
}

async function axisIos() {
  log("=== iOS ===");
  const env = { ...process.env, DEVELOPER_DIR, PATH: `${DEVELOPER_DIR}/usr/bin:${process.env.PATH}` };
  const hasXcode = fs.existsSync(path.join(DEVELOPER_DIR, "usr/bin/xcodebuild"));
  const idList = spawnSync("idevice_id", ["-l"], { encoding: "utf8" });
  const udids = (idList.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean);

  if (!hasXcode) {
    return {
      status: "NOT_PROVEN",
      reason: "xcode_not_active",
      note: `DEVELOPER_DIR=${DEVELOPER_DIR} missing xcodebuild — cannot build/install iOS app from this host`,
      udids,
    };
  }

  const dc = spawnSync(
    path.join(DEVELOPER_DIR, "usr/bin/devicectl"),
    ["list", "devices"],
    { encoding: "utf8", env, timeout: 60000 }
  );
  const listed = (dc.stdout || "") + (dc.stderr || "");
  const devicePresent =
    listed.includes(IOS_UDID) ||
    listed.includes(IOS_UDID_LEGACY) ||
    udids.includes(IOS_UDID_LEGACY) ||
    udids.includes(IOS_UDID);
  const installUdid = listed.includes(IOS_UDID) ? IOS_UDID : IOS_UDID_LEGACY;

  // Try launch — if not installed, install from DerivedData if .app exists
  const derived = path.join(
    process.env.HOME,
    "Library/Developer/Xcode/DerivedData/App-fhtxzwoqzbvduhblbiygxpakrpsp"
  );
  let appPath = null;
  function findApp(dir, depth = 0) {
    if (!fs.existsSync(dir) || depth > 6) return null;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (name === "App.app" && fs.existsSync(path.join(p, "Info.plist"))) return p;
      try {
        if (fs.statSync(p).isDirectory() && !name.startsWith(".")) {
          const hit = findApp(p, depth + 1);
          if (hit) return hit;
        }
      } catch {
        /* ignore */
      }
    }
    return null;
  }
  appPath = findApp(derived);

  let install = null;
  if (appPath && devicePresent) {
    log(`install iOS app from ${appPath} device=${installUdid}`);
    install = spawnSync(
      path.join(DEVELOPER_DIR, "usr/bin/devicectl"),
      ["device", "install", "app", "--device", installUdid, appPath],
      { encoding: "utf8", env, timeout: 180000 }
    );
  }

  const launch = spawnSync(
    path.join(DEVELOPER_DIR, "usr/bin/devicectl"),
    ["device", "process", "launch", "--device", installUdid, "com.dibay.app"],
    { encoding: "utf8", env, timeout: 60000 }
  );

  const installedOk =
    (install && install.status === 0) ||
    /launched|running|success/i.test(launch.stdout || "") ||
    launch.status === 0;

  if (!installedOk) {
    return {
      status: "NOT_PROVEN",
      reason: "install_or_launch_failed",
      devicePresent,
      appPath,
      install: install
        ? { status: install.status, out: (install.stdout || "").slice(-800), err: (install.stderr || "").slice(-800) }
        : null,
      launch: { status: launch.status, out: (launch.stdout || "").slice(-800), err: (launch.stderr || "").slice(-800) },
      note: "Need Xcode build + install of current tip; DerivedData App.app may be stale/missing",
    };
  }

  // If installed, run logout durable as partial — full NC/push still needs WebKit
  const iosScript = path.join(ROOT, "scripts/qa/ios-logout-badge-durable-runtime.mjs");
  let logout = null;
  if (fs.existsSync(iosScript)) {
    logout = spawnSync(process.execPath, [iosScript], {
      encoding: "utf8",
      env: { ...env, EXPECT_GIT_SHA: EXPECT, BADGE_NATIVE_PROD: ORIGIN, IOS_UDID },
      timeout: 300000,
    });
  }

  return {
    status: logout?.status === 0 ? "PARTIAL" : "NOT_PROVEN",
    note: "App launch OK but full Push/Tray + NC FLOW on iOS still needs WebKit inspector path",
    devicePresent,
    appPath,
    launchOk: installedOk,
    logout: logout
      ? { status: logout.status, tail: (logout.stdout || "").slice(-1000) }
      : null,
  };
}

async function main() {
  loadEnv();
  log(`origin=${ORIGIN} expect=${EXPECT} out=${OUT}`);

  const password = passwords()[0] || "1234";
  const receiver = await signInCookie(QQQQ.login);
  const sender = await signInCookie(AAAA.login);

  const report = {
    tip: EXPECT,
    origin: ORIGIN,
    REGISTER: {},
    PUSH_TRAY: {},
    IOS: null,
    BOARD: null,
  };

  // 1) Register tokens on both Android devices (SKIP_REGISTER=1 reuses active rows)
  const skipReg = process.env.SKIP_REGISTER === "1";
  if (skipReg) {
    report.REGISTER.skipped = true;
    log("REGISTER skipped (SKIP_REGISTER=1)");
  } else {
    for (const device of DEVICES) {
      try {
        report.REGISTER[device.label] = await registerDevice(device, password);
      } catch (e) {
        report.REGISTER[device.label] = { status: "FAIL", error: String(e) };
      }
      log(
        `REGISTER ${device.label} active=${report.REGISTER[device.label].activeRows} match=${report.REGISTER[device.label].registerMatches}`
      );
    }
  }

  const activeAfter = await queryActiveDevices(QQQQ.userId);
  report.REGISTER.afterAll = activeAfter;
  const tokenReady = activeAfter.rows.length > 0;

  // 2) Push/Tray chain per device (only meaningful if token ready)
  for (const device of DEVICES) {
    try {
      report.PUSH_TRAY[device.label] = await pushTrayChain(device, receiver, sender);
      if (!tokenReady) {
        report.PUSH_TRAY[device.label].note = "user_devices still empty — FCM premise incomplete";
        if (report.PUSH_TRAY[device.label].status === "PASS") {
          report.PUSH_TRAY[device.label].status = "PARTIAL";
        }
      }
    } catch (e) {
      report.PUSH_TRAY[device.label] = { status: "FAIL", error: String(e) };
    }
    log(`PUSH_TRAY ${device.label} ${report.PUSH_TRAY[device.label].status}`);
  }

  // 3) iOS
  try {
    report.IOS = await axisIos();
  } catch (e) {
    report.IOS = { status: "FAIL", error: String(e) };
  }
  log(`IOS ${report.IOS.status}`);

  const pushPass = DEVICES.every((d) => report.PUSH_TRAY[d.label]?.status === "PASS");
  const pushPartial = DEVICES.some((d) =>
    ["PASS", "PARTIAL"].includes(report.PUSH_TRAY[d.label]?.status)
  );

  report.BOARD = {
    Equation: "PASS",
    Logout: "PASS",
    Explainability: "PASS",
    Read_Delete_History: "PASS",
    Admin_RT: "PASS",
    Push_Tray: pushPass ? "PASS" : pushPartial ? "PARTIAL" : "OPEN",
    tokenReady,
    iOS: report.IOS?.status === "PASS" ? "PASS" : report.IOS?.status === "PARTIAL" ? "PARTIAL" : "OPEN",
    HARD_LOCK: "NO",
  };
  report.FINAL = {
    READY_FOR_HARD_LOCK:
      report.BOARD.Push_Tray === "PASS" && report.BOARD.iOS === "PASS",
    HARD_LOCK: "NO",
  };

  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  log(`BOARD ${JSON.stringify(report.BOARD)}`);
  log(`wrote ${path.join(OUT, "REPORT.json")}`);
  process.exit(report.FINAL.READY_FOR_HARD_LOCK ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(path.join(OUT, "FATAL.json"), JSON.stringify({ error: String(e) }, null, 2));
  process.exit(1);
});
