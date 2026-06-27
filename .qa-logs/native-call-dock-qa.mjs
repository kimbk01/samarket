#!/usr/bin/env node
/**
 * Native Video Activity-bound Dock Fast QA — 5 checks only.
 * 1 connected→dock  2 dock→resume  3 dock→end  4 end→dock removed  5 forbidden=0
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  DIBAY_PKG,
  buildApkSessionCookies,
  ensureApkWebViewLogin,
  launchApkMainActivity,
  restartApkForPushRegister,
} from "../scripts/qa/lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, ".qa-logs", "native-call-dock-qa");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = DIBAY_PKG;
const ACT = `${PKG}/.MainActivity`;
const WEB = process.env.CAPACITOR_SERVER_URL?.trim() || "https://samarket.vercel.app";
const SERIAL_A = process.env.P4_DEVICE_A?.trim() || "8b37179f7d94";
const SERIAL_B = process.env.P4_DEVICE_B?.trim() || "RRGL4046NTW";
const ROOM_ID = "b19e2672-f26f-4a2e-8125-52575da4a62a";
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const CDP_A = 9223;
const CDP_B = 9224;
const PASSWORD = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
const ACCEPT_ID = "com.dibay.app:id/native_video_call_accept";

const FORBIDDEN = [
  "route_to_screen",
  "CallV4Screen",
  "screen_mounted",
  "agora_join_success",
  "visible_surface_owner_claimed",
];
const O4_TAIL = [
  "runtime_cleanup_start",
  "agora_native_disconnected",
  "native_call_service_stop",
  "cleanup_done",
];

function adbObj(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}
function adb(serial, ...args) {
  return adbObj(serial, ...args).stdout ?? "";
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadEnvLocal() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
    }
  }
}

function readLogcat(serial) {
  return adb(
    serial,
    "logcat",
    "-d",
    "-s",
    "DIBAY_NATIVE_VIDEO:I",
    "DIBAY_CALL:I",
    "DIBAY_CALL_V4:I",
    "DIBAY_WebView:I",
    "Capacitor/Console:I",
    "*:S",
  );
}

function lineHasCallId(line, callId) {
  if (!callId) return false;
  if (line.includes(callId)) return true;
  const compact = callId.replace(/-/g, "");
  return compact.length >= 8 && line.includes(compact);
}

function countMarker(logs, marker, callId) {
  return logs.split("\n").filter((l) => l.includes(marker) && (!callId || lineHasCallId(l, callId))).length;
}

function countForbidden(logs, callId) {
  return Object.fromEntries(
    FORBIDDEN.map((m) => [m, logs.split("\n").filter((l) => l.includes(m) && lineHasCallId(l, callId)).length]),
  );
}

function dumpUiXml(serial) {
  adbObj(serial, "shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  return adb(serial, "shell", "cat", "/sdcard/uidump.xml");
}

function tapByPatterns(serial, patterns, opts = {}) {
  const minCenterY = opts.minCenterY ?? 0;
  const xml = dumpUiXml(serial);
  for (const re of patterns) {
    const m = xml.match(re);
    if (!m) continue;
    const left = Number(m[1]);
    const top = Number(m[2]);
    const right = Number(m[3]);
    const bottom = Number(m[4]);
    const x = Math.floor((left + right) / 2);
    const y = Math.floor((top + bottom) / 2);
    if (x <= 1 && y <= 1) continue;
    if (right - left < 8 || bottom - top < 8) continue;
    if (y < minCenterY) continue;
    adb(serial, "shell", "input", "tap", String(x), String(y));
    return { ok: true, x, y, pattern: re.source };
  }
  return { ok: false };
}

function tapByResourceId(serial, resourceSuffix, opts = {}) {
  const rid = `${PKG}:id/${resourceSuffix}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tapByPatterns(
    serial,
    [new RegExp(`resource-id="${rid}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`)],
    opts,
  );
}

function wakeDevice(serial) {
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "input", "keyevent", "82");
}

function activityCount(serial) {
  const out = adb(serial, "shell", "dumpsys", "activity", "activities");
  return (out.match(/ActivityRecord\{[^}]*NativeVideoCallActivity/g) || []).length;
}

function surfaceAttachCount(logs, callId) {
  return countMarker(logs, "remote_surface_attached", callId);
}

async function buildAuth(login, expectedUserId) {
  const { cookies, userId } = await buildApkSessionCookies({
    login,
    prod: WEB,
    password: PASSWORD,
    loadEnv: loadEnvLocal,
  });
  if (userId !== expectedUserId) throw new Error("auth_mismatch_" + login);
  return { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") };
}

function grantPerms(serial) {
  for (const perm of [
    "android.permission.RECORD_AUDIO",
    "android.permission.CAMERA",
    "android.permission.POST_NOTIFICATIONS",
  ]) {
    adbObj(serial, "shell", "pm", "grant", PKG, perm);
  }
}

async function ensureLogin() {
  grantPerms(SERIAL_A);
  grantPerms(SERIAL_B);
  for (const [serial, login, userId, port, label] of [
    [SERIAL_A, "aaaa", USER_A, CDP_A, "A"],
    [SERIAL_B, "qqqq", USER_B, CDP_B, "B"],
  ]) {
    const result = await ensureApkWebViewLogin({
      adb: adbObj,
      chromium,
      serial,
      cdpPort: port,
      act: ACT,
      pkg: PKG,
      prod: WEB,
      login,
      expectedUserId: userId,
      loadEnv: loadEnvLocal,
      password: PASSWORD,
      log: (m) => console.log(`[dock-qa] ${label} ${m}`),
      label,
      restartForFcm: false,
    });
    if (!result.ok) throw new Error(`login_${label}_fail`);
  }
}

async function prepareCalleePushReady() {
  adbObj(
    SERIAL_B,
    "shell",
    "am",
    "start",
    "-n",
    ACT,
    "-a",
    "android.intent.action.VIEW",
    "-d",
    `${WEB}/philife`,
    "-p",
    PKG,
  );
  await sleep(3000);
  adb(SERIAL_B, "shell", "input", "keyevent", "3");
  await sleep(1500);
  restartApkForPushRegister(adbObj, SERIAL_B, PKG, ACT, `${WEB}/community-messenger`);
  await sleep(18_000);
  adb(SERIAL_B, "shell", "input", "keyevent", "3");
  await sleep(1500);
}

async function apiDialVideo() {
  const auth = await buildAuth("aaaa", USER_A);
  const res = await fetch(`${WEB}/api/community-messenger/rooms/${ROOM_ID}/calls`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: auth.cookie },
    body: JSON.stringify({ callKind: "video", dialIntent: "fresh" }),
  });
  const json = await res.json().catch(() => ({}));
  const callId = json?.callId ?? "";
  return { ok: res.status === 200 && Boolean(callId), callId, status: res.status };
}

function tapAccept(serial, logs, callId) {
  for (const line of logs.split("\n").reverse()) {
    if (!line.includes("accept_button_bounds") || !lineHasCallId(line, callId)) continue;
    const m = line.match(/left=(\d+)\s+top=(\d+)\s+right=(\d+)\s+bottom=(\d+)/);
    if (!m) continue;
    const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
    const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
    adb(serial, "shell", "input", "tap", String(x), String(y));
    return { ok: true, via: "logcat_bounds" };
  }
  const xml = dumpUiXml(serial);
  const patterns = [
    new RegExp(`${ACCEPT_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`),
    /content-desc="[^"]*(?:수락|Accept)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (!m) continue;
    const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
    const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
    adb(serial, "shell", "input", "tap", String(x), String(y));
    return { ok: true, via: "uiautomator" };
  }
  return { ok: false };
}

async function waitIncoming(serial, callId, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = readLogcat(serial);
    if (countMarker(logs, "incoming_activity_shown", callId) >= 1) return { ok: true, logs };
    if (countMarker(logs, "incoming_fcm_received", callId) >= 1) return { ok: true, logs };
    await sleep(500);
  }
  return { ok: false, logs: readLogcat(serial) };
}

async function waitConnected(serial, callId, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = readLogcat(serial);
    if (countMarker(logs, "state_connected", callId) >= 1 && countMarker(logs, "native_connected_emit", callId) >= 1) {
      return { ok: true, logs };
    }
    await sleep(500);
  }
  return { ok: false, logs: readLogcat(serial) };
}

async function waitO4Chain(serial, callId, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = readLogcat(serial);
    const observed = Object.fromEntries(O4_TAIL.map((m) => [m, countMarker(logs, m, callId) >= 1]));
    if (Object.values(observed).every(Boolean)) return { ok: true, observed, logs };
    await sleep(500);
  }
  const logs = readLogcat(serial);
  return {
    ok: false,
    observed: Object.fromEntries(O4_TAIL.map((m) => [m, countMarker(logs, m, callId) >= 1])),
    logs,
  };
}

async function scenarioCleanupOnly() {
  for (const [login, userId] of [
    ["aaaa", USER_A],
    ["qqqq", USER_B],
  ]) {
    try {
      const auth = await buildAuth(login, userId);
      await fetch(`${WEB}/api/community-messenger/calls/active/end-all`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: auth.cookie },
        body: "{}",
      });
    } catch {
      /* best-effort */
    }
  }
}

function tapDockMinimize(serial) {
  wakeDevice(serial);
  const byDesc = tapByPatterns(
    serial,
    [/content-desc="dock_minimize"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/],
    { minCenterY: 400 },
  );
  if (byDesc.ok) return byDesc;
  return { ok: false, reason: "dock_minimize_missing" };
}

async function waitConnectedUi(serial, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    wakeDevice(serial);
    const xml = dumpUiXml(serial);
    if (xml.includes('content-desc="dock_minimize"') || xml.includes("native_video_call_end")) {
      return { ok: true };
    }
    await sleep(500);
  }
  return { ok: false };
}

async function tapDockMinimizeWithRetry(serial, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    const tap = tapDockMinimize(serial);
    if (tap.ok) return tap;
    await sleep(600);
  }
  return { ok: false, reason: "dock_minimize_missing" };
}

function dockVisible(serial) {
  const xml = dumpUiXml(serial);
  return xml.includes("native_call_dock_root") || xml.includes("native_call_dock_resume");
}

function fullConnectedVisible(serial) {
  const xml = dumpUiXml(serial);
  return xml.includes("native_video_call_end") && !xml.includes("native_call_dock_root");
}

async function runDockFastQa() {
  adb(SERIAL_B, "logcat", "-c");
  adb(SERIAL_A, "logcat", "-c");
  await prepareCalleePushReady();
  wakeDevice(SERIAL_B);

  const dial = await apiDialVideo();
  if (!dial.ok) return { pass: false, stage: "api_dial", dial };

  const callId = dial.callId;
  const incoming = await waitIncoming(SERIAL_B, callId);
  if (!incoming.ok) return { pass: false, stage: "incoming", callId };

  wakeDevice(SERIAL_B);
  const acceptTap = tapAccept(SERIAL_B, readLogcat(SERIAL_B), callId);
  if (!acceptTap.ok) return { pass: false, stage: "accept_tap", callId, acceptTap };

  const connected = await waitConnected(SERIAL_B, callId);
  if (!connected.ok) return { pass: false, stage: "connected", callId };

  const uiReady = await waitConnectedUi(SERIAL_B);
  if (!uiReady.ok) return { pass: false, stage: "connected_ui", callId };

  const joinBeforeDock = countMarker(readLogcat(SERIAL_B), "agora_native_join_success", callId);
  await sleep(800);

  const minimizeTap = await tapDockMinimizeWithRetry(SERIAL_B, 6);
  await sleep(900);

  let logs = readLogcat(SERIAL_B);
  const dockShown =
    countMarker(logs, "native_video_dock_shown", callId) >= 1 && dockVisible(SERIAL_B);

  const resumeTap = tapByResourceId(SERIAL_B, "native_call_dock_resume");
  await sleep(900);
  logs = readLogcat(SERIAL_B);
  const dockResume =
    countMarker(logs, "native_video_dock_resume", callId) >= 1 &&
    countMarker(logs, "native_video_dock_hidden", callId) >= 1 &&
    fullConnectedVisible(SERIAL_B);

  const minimizeAgain = await tapDockMinimizeWithRetry(SERIAL_B, 4);
  await sleep(900);
  const endTap = tapByResourceId(SERIAL_B, "native_call_dock_end");
  await sleep(1200);

  logs = `${readLogcat(SERIAL_A)}\n---\n${readLogcat(SERIAL_B)}`;
  const endTapped = countMarker(logs, "end_tapped", callId) >= 1;
  const o4 = endTapped ? await waitO4Chain(SERIAL_B, callId) : { ok: false, observed: {} };
  const dockRemovedAfterEnd =
    countMarker(logs, "native_video_dock_hidden", callId) >= 2 &&
    !dockVisible(SERIAL_B) &&
    activityCount(SERIAL_B) <= 0;

  const forbidden = countForbidden(logs, callId);
  const forbiddenOk = FORBIDDEN.every((m) => forbidden[m] === 0);
  const joinAfterDock = countMarker(logs, "agora_native_join_success", callId);
  const joinNoReentry = joinAfterDock <= joinBeforeDock;
  const cleanupCount = countMarker(logs, "runtime_cleanup_start", callId);
  const cleanupNotDup = cleanupCount <= 1;
  const actCount = activityCount(SERIAL_B);
  const singleActivity = actCount <= 1;
  const singleSurface = surfaceAttachCount(logs, callId) <= 2;

  await scenarioCleanupOnly();

  const checks = {
    connectedToDock: dockShown,
    dockResume: dockResume,
    dockEnd: endTap.ok && endTapped && o4.ok,
    dockRemoved: dockRemovedAfterEnd,
    forbiddenOk,
    joinNoReentry,
    cleanupNotDup,
    singleActivity,
    singleSurface,
  };

  return {
    pass: Object.values(checks).every(Boolean),
    callId,
    checks,
    minimizeTap,
    minimizeAgain,
    resumeTap,
    endTap,
    acceptTap,
    forbidden,
    joinBeforeDock,
    joinAfterDock,
    cleanupCount,
    actCount,
    surfaceAttachCount: surfaceAttachCount(logs, callId),
    o4: o4.observed,
    logs,
  };
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  loadEnvLocal();
  console.log(`[dock-qa] devices A=${SERIAL_A} B=${SERIAL_B}`);
  await scenarioCleanupOnly();
  await sleep(1500);
  adbObj(SERIAL_A, "shell", "am", "force-stop", PKG);
  adbObj(SERIAL_B, "shell", "am", "force-stop", PKG);
  await sleep(1500);
  await ensureLogin();
  launchApkMainActivity(adbObj, SERIAL_A, ACT);
  launchApkMainActivity(adbObj, SERIAL_B, ACT);
  await sleep(2000);

  const result = await runDockFastQa();
  if (result.logs) {
    fs.writeFileSync(path.join(OUT, `logcat-dock-${result.callId || "none"}.txt`), result.logs);
    delete result.logs;
  }
  const report = {
    at: new Date().toISOString(),
    serialA: SERIAL_A,
    serialB: SERIAL_B,
    result,
    overallPass: Boolean(result.pass),
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.overallPass ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
