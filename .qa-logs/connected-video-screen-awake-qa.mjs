#!/usr/bin/env node
/**
 * Connected video screen-awake lease QA (Red-Team).
 * A: incoming fullscreen connected hold
 * B: outgoing connected dock hold
 * C: fullscreen ↔ dock then hold
 * D: rotation hold
 * E: end → release + mHoldScreenWindow=null
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
  restartApkForPushRegister,
} from "../scripts/qa/lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, ".qa-logs", "connected-video-screen-awake-qa");
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
const HOLD_MS = Number(process.env.SCREEN_AWAKE_HOLD_MS || "120000");
const ACCEPT_ID = "native_video_call_accept";

const REQUIRED_MARKERS = [
  "screen_awake_acquire",
  "screen_awake_apply_current_activity",
  "screen_awake_reapply_on_resume",
  "screen_awake_release",
];

fs.mkdirSync(OUT, { recursive: true });

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

function clearLogcat(serial) {
  adbObj(serial, "logcat", "-c");
}

function readScreenAwakeLogcat(serial) {
  return adb(serial, "logcat", "-d", "-s", "DIBAY_SCREEN_AWAKE:I", "*:S");
}

function readHoldScreenWindow(serial) {
  const out = adb(serial, "shell", "dumpsys", "window");
  const m = out.match(/mHoldScreenWindow=([^\s]+)/);
  return m ? m[1] : "missing";
}

function dumpWindow(serial, label) {
  const hold = readHoldScreenWindow(serial);
  const out = adb(serial, "shell", "dumpsys", "window");
  fs.writeFileSync(path.join(OUT, `dumpsys-window-${label}.txt`), out);
  return hold;
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
    return { ok: true, x, y };
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

function setPortrait(serial) {
  adb(serial, "shell", "settings", "put", "system", "accelerometer_rotation", "0");
  adb(serial, "shell", "settings", "put", "system", "user_rotation", "0");
}

function setLandscape(serial) {
  adb(serial, "shell", "settings", "put", "system", "accelerometer_rotation", "0");
  adb(serial, "shell", "settings", "put", "system", "user_rotation", "1");
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
      log: (m) => console.log(`[screen-awake-qa] ${label} ${m}`),
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
  if (res.status !== 200 || !callId) throw new Error(`dial_fail_${res.status}`);
  return String(callId);
}

async function waitConnected(serial, callId, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const logs = readScreenAwakeLogcat(serial);
    if (countMarker(logs, "screen_awake_acquire", callId) > 0) return true;
    const native = adb(serial, "logcat", "-d", "-s", "DIBAY_NATIVE_VIDEO:I", "*:S");
    if (native.includes("state_connected") && lineHasCallId(native, callId)) return true;
    await sleep(2000);
  }
  return false;
}

async function acceptIncoming(serial) {
  wakeDevice(serial);
  await sleep(800);
  let tap = tapByResourceId(serial, ACCEPT_ID);
  if (!tap.ok) {
    tap = tapByPatterns(serial, [
      new RegExp(`resource-id="com\\.dibay\\.app:id/${ACCEPT_ID}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`),
      /text="Accept"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
      /text="수락"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    ]);
  }
  return tap.ok;
}

async function waitHoldScreen(serial, expectNonNull, label) {
  const hold = dumpWindow(serial, label);
  if (expectNonNull) return hold !== "null" && hold !== "missing";
  return hold === "null";
}

async function endCall(serial) {
  tapByResourceId(serial, "native_video_call_end");
  await sleep(500);
  tapByResourceId(serial, "native_call_dock_end");
  await sleep(500);
  tapByPatterns(serial, [/text="End"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i]);
}

async function minimizeToDock(serial) {
  return tapByPatterns(serial, [
    /content-desc="dock_minimize"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    new RegExp(`resource-id="${PKG.replace(/\./g, "\\.")}:id/native_video_call_dock"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`),
  ]);
}

async function expandFromDock(serial) {
  return tapByResourceId(serial, "native_call_dock_resume");
}

function judgeMarkers(logs, callId) {
  return Object.fromEntries(REQUIRED_MARKERS.map((m) => [m, countMarker(logs, m, callId) > 0]));
}

async function runScenarioA() {
  clearLogcat(SERIAL_A);
  clearLogcat(SERIAL_B);
  await prepareCalleePushReady();
  const callId = await apiDialVideo();
  console.log(`[A] callId=${callId}`);
  await sleep(8000);
  const accepted = await acceptIncoming(SERIAL_B);
  if (!accepted) throw new Error("A_accept_fail");
  const connected = await waitConnected(SERIAL_B, callId);
  if (!connected) throw new Error("A_not_connected");
  const holdStart = dumpWindow(SERIAL_B, "A-connected-start");
  if (holdStart === "null" || holdStart === "missing") throw new Error("A_hold_null_at_start");
  console.log(`[A] holding ${HOLD_MS}ms on fullscreen...`);
  await sleep(HOLD_MS);
  const holdMid = readHoldScreenWindow(SERIAL_B);
  const logs = readScreenAwakeLogcat(SERIAL_B);
  await endCall(SERIAL_B);
  await endCall(SERIAL_A);
  await sleep(4000);
  const holdEnd = dumpWindow(SERIAL_B, "A-after-end");
  return {
    case: "A_incoming_fullscreen",
    callId,
    accepted,
    holdStart,
    holdMid,
    holdEnd,
    markers: judgeMarkers(logs, callId),
    pass:
      holdMid !== "null" &&
      holdMid !== "missing" &&
      holdEnd === "null" &&
      judgeMarkers(logs, callId).screen_awake_acquire &&
      judgeMarkers(logs, callId).screen_awake_apply_current_activity &&
      judgeMarkers(logs, callId).screen_awake_release,
  };
}

async function runScenarioB() {
  clearLogcat(SERIAL_A);
  clearLogcat(SERIAL_B);
  await prepareCalleePushReady();
  const callId = await apiDialVideo();
  console.log(`[B] callId=${callId}`);
  await sleep(8000);
  await acceptIncoming(SERIAL_B);
  await waitConnected(SERIAL_A, callId);
  await waitConnected(SERIAL_B, callId);
  await sleep(5000);
  const docked = await minimizeToDock(SERIAL_A);
  if (!docked.ok) throw new Error("B_dock_fail");
  await sleep(3000);
  const holdStart = dumpWindow(SERIAL_A, "B-dock-start");
  console.log(`[B] holding ${HOLD_MS}ms on dock...`);
  await sleep(HOLD_MS);
  const holdMid = readHoldScreenWindow(SERIAL_A);
  const logs = readScreenAwakeLogcat(SERIAL_A);
  await endCall(SERIAL_A);
  await endCall(SERIAL_B);
  await sleep(4000);
  const holdEnd = dumpWindow(SERIAL_A, "B-after-end");
  return {
    case: "B_outgoing_dock",
    callId,
    docked,
    holdStart,
    holdMid,
    holdEnd,
    markers: judgeMarkers(logs, callId),
    pass:
      holdMid !== "null" &&
      holdMid !== "missing" &&
      holdEnd === "null" &&
      judgeMarkers(logs, callId).screen_awake_acquire &&
      judgeMarkers(logs, callId).screen_awake_apply_current_activity,
  };
}

async function runScenarioC() {
  clearLogcat(SERIAL_A);
  clearLogcat(SERIAL_B);
  await prepareCalleePushReady();
  const callId = await apiDialVideo();
  console.log(`[C] callId=${callId}`);
  await sleep(8000);
  await acceptIncoming(SERIAL_B);
  await waitConnected(SERIAL_A, callId);
  await minimizeToDock(SERIAL_A);
  await sleep(3000);
  await expandFromDock(SERIAL_A);
  await sleep(3000);
  await minimizeToDock(SERIAL_A);
  await sleep(3000);
  const holdStart = dumpWindow(SERIAL_A, "C-after-toggle");
  console.log(`[C] holding ${HOLD_MS}ms after fullscreen↔dock...`);
  await sleep(HOLD_MS);
  const holdMid = readHoldScreenWindow(SERIAL_A);
  const logsA = readScreenAwakeLogcat(SERIAL_A);
  const logsB = readScreenAwakeLogcat(SERIAL_B);
  const logs = logsA + "\n" + logsB;
  await endCall(SERIAL_A);
  await endCall(SERIAL_B);
  await sleep(4000);
  const holdEnd = dumpWindow(SERIAL_A, "C-after-end");
  const markers = judgeMarkers(logs, callId);
  return {
    case: "C_fullscreen_dock_toggle",
    callId,
    holdStart,
    holdMid,
    holdEnd,
    markers,
    pass:
      holdMid !== "null" &&
      holdMid !== "missing" &&
      holdEnd === "null" &&
      markers.screen_awake_acquire &&
      markers.screen_awake_apply_current_activity,
  };
}

async function runScenarioD() {
  clearLogcat(SERIAL_A);
  clearLogcat(SERIAL_B);
  await prepareCalleePushReady();
  const callId = await apiDialVideo();
  console.log(`[D] callId=${callId}`);
  await sleep(8000);
  await acceptIncoming(SERIAL_B);
  await waitConnected(SERIAL_B, callId);
  setLandscape(SERIAL_B);
  await sleep(2500);
  const holdLand = readHoldScreenWindow(SERIAL_B);
  setPortrait(SERIAL_B);
  await sleep(2500);
  const holdPort = readHoldScreenWindow(SERIAL_B);
  console.log(`[D] holding ${HOLD_MS}ms after rotation...`);
  await sleep(HOLD_MS);
  const holdMid = readHoldScreenWindow(SERIAL_B);
  const logs = readScreenAwakeLogcat(SERIAL_B);
  await endCall(SERIAL_B);
  await endCall(SERIAL_A);
  await sleep(4000);
  const holdEnd = dumpWindow(SERIAL_B, "D-after-end");
  const markers = judgeMarkers(logs, callId);
  return {
    case: "D_rotation",
    callId,
    holdLand,
    holdPort,
    holdMid,
    holdEnd,
    markers,
    pass:
      holdLand !== "null" &&
      holdPort !== "null" &&
      holdMid !== "null" &&
      holdEnd === "null" &&
      markers.screen_awake_acquire &&
      markers.screen_awake_apply_current_activity,
  };
}

async function runScenarioE() {
  clearLogcat(SERIAL_B);
  await prepareCalleePushReady();
  const callId = await apiDialVideo();
  await sleep(8000);
  await acceptIncoming(SERIAL_B);
  await waitConnected(SERIAL_B, callId);
  await sleep(5000);
  const holdConnected = dumpWindow(SERIAL_B, "E-connected");
  await endCall(SERIAL_B);
  await endCall(SERIAL_A);
  await sleep(5000);
  const holdEnd = dumpWindow(SERIAL_B, "E-after-end");
  const logs = readScreenAwakeLogcat(SERIAL_B);
  const markers = judgeMarkers(logs, callId);
  return {
    case: "E_release",
    callId,
    holdConnected,
    holdEnd,
    markers,
    pass:
      holdConnected !== "null" &&
      holdConnected !== "missing" &&
      holdEnd === "null" &&
      markers.screen_awake_release,
  };
}

async function main() {
  loadEnvLocal();
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`[screen-awake-qa] HOLD_MS=${HOLD_MS} OUT=${OUT}`);
  await ensureLogin();
  const results = [];
  for (const run of [runScenarioE, runScenarioA, runScenarioB, runScenarioC, runScenarioD]) {
    try {
      results.push(await run());
    } catch (err) {
      results.push({ case: run.name, pass: false, error: String(err?.message || err) });
    }
    await sleep(8000);
  }
  const report = {
    at: new Date().toISOString(),
    holdMs: HOLD_MS,
    serialA: SERIAL_A,
    serialB: SERIAL_B,
    results,
    overallPass: results.every((r) => r.pass === true),
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.overallPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
