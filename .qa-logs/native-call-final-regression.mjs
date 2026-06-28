#!/usr/bin/env node
/**
 * Native Call Runtime — Final Regression (1 run only).
 * Gates: voice out/in, video out/in, PiP, Dock, O4 cleanup, forbidden 0, single surface, CallV4Screen 0.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  DIBAY_PKG,
  buildApkSessionCookies,
  connectWebView,
  ensureApkWebViewLogin,
  forwardCdp,
  navigateApkWebView,
  launchApkMainActivity,
  discoverWebViewSocket,
  restartApkForPushRegister,
} from "../scripts/qa/lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, ".qa-logs", "native-call-final-regression");
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

const ACCEPT_CHAIN_MARKERS = [
  "accept_tapped",
  "accept_patch_start",
  "accept_patch_done",
  "token_fetch_start",
  "token_fetch_done",
  "agora_native_join_start",
  "agora_native_join_success",
  "state_connected",
  "native_connected_emit",
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
    "DIBAY_NATIVE_VOICE:I",
    "DIBAY_NATIVE_VIDEO:I",
    "DIBAY_CALL:I",
    "DIBAY_CALL_V4:I",
    "DIBAY_WebView:I",
    "Capacitor/Console:I",
    "*:S",
  );
}

function readLogcatFull(serial) {
  return adb(serial, "logcat", "-d");
}

/** Persist A/B full logcat before next gate clearLogcat(). Scoring unchanged. */
function saveGateSnapshot(gateSnapshots, gateName, callId) {
  const slug = callId && String(callId).trim() ? String(callId).trim() : "none";
  const relA = `logcat-${gateName}-${slug}-a.txt`;
  const relB = `logcat-${gateName}-${slug}-b.txt`;
  fs.writeFileSync(path.join(OUT, relA), readLogcatFull(SERIAL_A));
  fs.writeFileSync(path.join(OUT, relB), readLogcatFull(SERIAL_B));
  gateSnapshots[gateName] = {
    callId: callId || null,
    logcatA: relA,
    logcatB: relB,
  };
  return gateSnapshots[gateName];
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

function countForbidden(logs, callIds) {
  const ids = Array.isArray(callIds) ? callIds : [callIds];
  return Object.fromEntries(
    FORBIDDEN.map((m) => [
      m,
      logs
        .split("\n")
        .filter((l) => ids.some((id) => lineHasCallId(l, id)) && lineMatchesForbiddenMarker(l, m)).length,
    ]),
  );
}

function lineMatchesForbiddenMarker(line, marker) {
  if (marker === "agora_join_success") {
    return /\bagora_join_success\b/.test(line) && !line.includes("agora_native_join_success");
  }
  return line.includes(marker);
}

function isSingleDialingSurface(logs, callId) {
  const shown = countMarker(logs, "native_dialing_surface_shown", callId);
  return shown >= 1 && shown <= 2;
}

function isSingleIncomingSurface(logs, callId) {
  const shown = countMarker(logs, "incoming_activity_shown", callId);
  return shown >= 1 && shown <= 2;
}

function countAcceptChainMarker(logs, marker, callId, mediaKind) {
  if (mediaKind === "video" && marker === "agora_native_join_start") {
    return (
      countMarker(logs, "agora_native_join_start", callId) +
      countMarker(logs, "agora_native_video_join_start", callId)
    );
  }
  if (mediaKind === "video" && marker === "agora_native_join_success") {
    return (
      countMarker(logs, "agora_native_join_success", callId) +
      countMarker(logs, "agora_native_video_join_success", callId)
    );
  }
  return countMarker(logs, marker, callId);
}

function acceptChainMarkerCounts(logs, callId, mediaKind) {
  return Object.fromEntries(
    ACCEPT_CHAIN_MARKERS.map((m) => [m, countAcceptChainMarker(logs, m, callId, mediaKind)]),
  );
}

function snapshotTelemetry(gateSnapshots, gateName) {
  const snap = gateSnapshots[gateName];
  if (!snap) return { snapshot: null };
  return {
    callId: snap.callId,
    logcatA: snap.logcatA,
    logcatB: snap.logcatB,
  };
}

function forbiddenOk(forbidden) {
  return FORBIDDEN.every((m) => forbidden[m] === 0);
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
    const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
    const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
    if (x <= 1 || y <= 1) continue;
    if (y < minCenterY) continue;
    adb(serial, "shell", "input", "tap", String(x), String(y));
    return { ok: true, x, y };
  }
  return { ok: false };
}

function tapByResourceId(serial, suffix, opts = {}) {
  const rid = `${PKG}:id/${suffix}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tapByPatterns(serial, [new RegExp(`resource-id="${rid}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`)], opts);
}

function wakeDevice(serial) {
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "input", "keyevent", "82");
}

function activityCount(serial, activityName) {
  const out = adb(serial, "shell", "dumpsys", "activity", "activities");
  const re = new RegExp(`ActivityRecord\\{[^}]*${activityName}`, "g");
  return (out.match(re) || []).length;
}

/** Log-based surface guard — dumpsys ActivityRecord counts include stale entries. */
function singleSurfaceFromLogs(logs, callId, kind) {
  if (kind === "dialing") return isSingleDialingSurface(logs, callId);
  if (kind === "incoming") return isSingleIncomingSurface(logs, callId);
  return isSingleDialingSurface(logs, callId) || isSingleIncomingSurface(logs, callId);
}

function clearLogcat() {
  adb(SERIAL_A, "logcat", "-c");
  adb(SERIAL_B, "logcat", "-c");
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
      log: (m) => console.log(`[final-reg] ${label} ${m}`),
      label,
      restartForFcm: false,
    });
    if (!result.ok) throw new Error(`login_${label}_fail`);
  }
}

async function warmWebView(serial) {
  launchApkMainActivity(adbObj, serial, ACT);
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    if (discoverWebViewSocket(adbObj, serial)) return { ok: true };
  }
  return { ok: false };
}

async function cdpPage(serial, port, fn) {
  const warm = await warmWebView(serial);
  if (!warm.ok) throw new Error(`webview_timeout_${serial}`);
  forwardCdp(adbObj, serial, port);
  const { browser, page } = await connectWebView(chromium, port);
  try {
    return await fn(page);
  } finally {
    await browser.close().catch(() => {});
    adbObj(serial, "forward", "--remove", `tcp:${port}`);
  }
}

async function dialNativeOutgoing(mediaType) {
  return cdpPage(SERIAL_A, CDP_A, async (page) => {
    const { cookies } = await buildApkSessionCookies({
      login: "aaaa",
      prod: WEB,
      password: PASSWORD,
      loadEnv: loadEnvLocal,
    });
    await page.context().addCookies(cookies);
    await navigateApkWebView(page, `${WEB}/community-messenger/rooms/${ROOM_ID}`, 10_000);
    await sleep(2000);
    return page.evaluate(
      async ({ roomId, peerUserId, mediaType: mt }) => {
        const res = await fetch(`/api/community-messenger/rooms/${roomId}/calls`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ callKind: mt, dialIntent: "fresh" }),
        });
        const json = await res.json().catch(() => ({}));
        const callId = json?.callId ?? "";
        if (!callId) return { ok: false, reason: "api_no_call_id" };
        const cap = window.Capacitor?.Plugins?.NativeCallService;
        if (!cap?.startNativeOutgoingEstablishment) return { ok: false, reason: "no_native_plugin", callId };
        const native = await cap.startNativeOutgoingEstablishment({
          callId,
          roomId,
          mediaType: mt,
          peerUserId,
          peerName: "peer",
        });
        return { ok: Boolean(native?.nativeOwned ?? native?.ok), callId };
      },
      { roomId: ROOM_ID, peerUserId: USER_B, mediaType },
    );
  });
}

async function apiDial(kind) {
  const auth = await buildAuth("aaaa", USER_A);
  const res = await fetch(`${WEB}/api/community-messenger/rooms/${ROOM_ID}/calls`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: auth.cookie },
    body: JSON.stringify({ callKind: kind, dialIntent: "fresh" }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.status === 200 && Boolean(json?.callId), callId: json?.callId ?? "" };
}

async function prepareCalleePushReady() {
  adbObj(SERIAL_B, "shell", "am", "start", "-n", ACT, "-a", "android.intent.action.VIEW", "-d", `${WEB}/philife`, "-p", PKG);
  await sleep(3000);
  adb(SERIAL_B, "shell", "input", "keyevent", "3");
  await sleep(1500);
  restartApkForPushRegister(adbObj, SERIAL_B, PKG, ACT, `${WEB}/community-messenger`);
  await sleep(18_000);
  adb(SERIAL_B, "shell", "input", "keyevent", "3");
  await sleep(1500);
}

function readPushRegisterLogcat(serial) {
  return adb(
    serial,
    "logcat",
    "-d",
    "-s",
    "DIBAY_PUSH_REGISTER:I",
    "DIBAY_PUSH_REGISTER_FAIL:E",
    "DIBAY_WebView:I",
    "Capacitor/Console:I",
    "*:S",
  );
}

/** Same readiness contract as native-visible-surface-matrix / v4-runtime-readonly FCM gate. */
function parseCalleeFcmRegisterReady(registerLogcat, expectedUserId) {
  const hasTimeout =
    /"step":"registration_timeout"/.test(registerLogcat) ||
    /DIBAY_PUSH_REGISTER_FAIL.*registration_timeout/.test(registerLogcat);
  const hasToken =
    /"step":"registration_event"/.test(registerLogcat) &&
    /"token_len":[1-9]/.test(registerLogcat) &&
    registerLogcat.includes(expectedUserId);
  const hasSuccess =
    (/"step":"success"/.test(registerLogcat) && registerLogcat.includes(expectedUserId)) ||
    registerLogcat.includes(`success user_id=${expectedUserId}`);
  const reg = [...registerLogcat.matchAll(/"user_id":"([^"]+)"/g)];
  const fcmUserId = reg.length ? reg[reg.length - 1][1] : null;
  const ready = hasSuccess || (hasToken && fcmUserId === expectedUserId);
  return { ready, hasTimeout, hasToken, hasSuccess, fcmUserId };
}

/** Gate 2 only — do not dial until B FCM registration is stable after force-stop settle. */
async function waitCalleeFcmReady() {
  const started = Date.now();
  const deadline = Date.now() + 50_000;
  let last = parseCalleeFcmRegisterReady("", USER_B);
  while (Date.now() < deadline) {
    await sleep(2000);
    last = parseCalleeFcmRegisterReady(readPushRegisterLogcat(SERIAL_B), USER_B);
    if (last.ready) {
      return { ok: true, ...last, elapsedMs: Date.now() - started };
    }
  }
  const finalLogs = readPushRegisterLogcat(SERIAL_B);
  last = parseCalleeFcmRegisterReady(finalLogs, USER_B);
  const reason = last.hasTimeout ? "registration_timeout" : "fcm_ready_timeout";
  return {
    ok: false,
    stage: "harness_fcm_ready_fail",
    reason,
    ...last,
    elapsedMs: Date.now() - started,
    pushRegisterLogTail: finalLogs.split("\n").filter(Boolean).slice(-20),
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

/** Drain Native/app state between gates — API cleanup alone is insufficient for sequential runs. */
async function settleBetweenGates() {
  adbObj(SERIAL_A, "shell", "am", "force-stop", PKG);
  adbObj(SERIAL_B, "shell", "am", "force-stop", PKG);
  await sleep(3000);
}

async function waitIncoming(serial, callId, marker = "incoming_activity_shown") {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const logs = readLogcat(serial);
    if (countMarker(logs, marker, callId) >= 1) return { ok: true, logs };
    if (countMarker(logs, "incoming_fcm_received", callId) >= 1) return { ok: true, logs };
    await sleep(500);
  }
  return { ok: false };
}

async function waitConnected(serial, callId) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const logs = readLogcat(serial);
    if (countMarker(logs, "state_connected", callId) >= 1 && countMarker(logs, "native_connected_emit", callId) >= 1) {
      return { ok: true };
    }
    await sleep(500);
  }
  return { ok: false };
}

async function waitConnectedTimed(serial, callId) {
  const started = Date.now();
  const result = await waitConnected(serial, callId);
  return { ok: result.ok, elapsedMs: Date.now() - started };
}

async function waitO4(serial, callId) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const logs = readLogcat(serial);
    if (O4_TAIL.every((m) => countMarker(logs, m, callId) >= 1)) return { ok: true };
    await sleep(500);
  }
  return { ok: false };
}

function tapAccept(serial, acceptId) {
  wakeDevice(serial);
  const xml = dumpUiXml(serial);
  const rid = `${PKG}:id/${acceptId}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`${rid}[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`),
    /content-desc="[^"]*(?:수락|Accept)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
  ];
  return tapByPatterns(serial, patterns);
}

function tapEnd(serial, suffix) {
  wakeDevice(serial);
  const byId = tapByResourceId(serial, suffix, { minCenterY: 500 });
  if (byId.ok) return byId;
  return tapByPatterns(serial, [/text="종료"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/], { minCenterY: 500 });
}

async function waitConnectedUi(serial) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    wakeDevice(serial);
    const xml = dumpUiXml(serial);
    if (xml.includes('content-desc="dock_minimize"') || xml.includes("native_video_call_end")) return true;
    await sleep(500);
  }
  return false;
}

async function ensureNativeVideoForeground(serial, callId, uiMode = "outgoing") {
  adbObj(
    serial,
    "shell",
    "am",
    "start",
    "-n",
    `${PKG}/.nativevideo.NativeVideoCallActivity`,
    "--es",
    "callId",
    callId,
    "--es",
    "uiMode",
    uiMode,
    "-f",
    "0x24000000",
  );
  await sleep(1200);
  return dumpUiXml(serial).includes("native_video_call_root");
}

async function tapDockMinimize(serial) {
  for (let i = 0; i < 6; i++) {
    const tap = tapByPatterns(serial, [/content-desc="dock_minimize"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/], {
      minCenterY: 400,
    });
    if (tap.ok) return tap;
    await sleep(600);
  }
  return { ok: false };
}

function parsePipBounds(serial) {
  const out = adb(serial, "shell", "dumpsys", "activity", "activities");
  const m =
    out.match(/PictureInPictureParams[^]*?bounds=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/i) ||
    out.match(/pinned[^]*?bounds=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/i);
  if (!m) return null;
  return {
    x: Math.floor((Number(m[1]) + Number(m[3])) / 2),
    y: Math.floor((Number(m[2]) + Number(m[4])) / 2),
  };
}

async function tryPipRestore(serial, callId) {
  wakeDevice(serial);
  await sleep(500);
  adb(serial, "shell", "input", "keyevent", "3");
  await sleep(2000);
  const entered = countMarker(readLogcat(serial), "native_video_pip_entered", callId) >= 1;
  if (!entered) return { ok: false, stage: "pip_enter" };
  const bounds = parsePipBounds(serial);
  if (bounds) {
    adb(serial, "shell", "input", "tap", String(bounds.x), String(bounds.y));
    await sleep(400);
    adb(serial, "shell", "input", "tap", String(bounds.x), String(bounds.y));
  }
  await sleep(1500);
  const exited = countMarker(readLogcat(serial), "native_video_pip_exited", callId) >= 1;
  return { ok: entered && exited, entered, exited };
}

async function resetBetween() {
  await scenarioCleanupOnly();
  await sleep(1500);
  adbObj(SERIAL_A, "shell", "am", "force-stop", PKG);
  adbObj(SERIAL_B, "shell", "am", "force-stop", PKG);
  await sleep(1200);
}

async function runVoiceOutgoingOnly() {
  clearLogcat();
  const vOutDial = await dialNativeOutgoing("voice");
  if (!vOutDial.ok) return { pass: false, stage: "voice_outgoing_dial", dial: vOutDial };

  const voiceOutId = vOutDial.callId;
  let deadline = Date.now() + 45_000;
  let voiceOutDialing = false;
  while (Date.now() < deadline) {
    if (countMarker(readLogcat(SERIAL_A), "native_dialing_surface_shown", voiceOutId) >= 1) {
      voiceOutDialing = true;
      break;
    }
    await sleep(400);
  }

  await sleep(1200);
  const logs = readLogcat(SERIAL_A);
  const forbidden = countForbidden(logs, voiceOutId);
  const pass =
    voiceOutDialing &&
    singleSurfaceFromLogs(logs, voiceOutId, "dialing") &&
    forbiddenOk(forbidden);

  return {
    pass,
    callId: voiceOutId,
    voiceOutDialing,
    singleSurface: singleSurfaceFromLogs(logs, voiceOutId, "dialing"),
    dialingShownCount: countMarker(logs, "native_dialing_surface_shown", voiceOutId),
    forbidden,
    nativeMarkerCounts: {
      caller_outgoing_start: countMarker(logs, "caller_outgoing_start", voiceOutId),
      native_dialing_surface_shown: countMarker(logs, "native_dialing_surface_shown", voiceOutId),
      agora_native_join_success: countMarker(logs, "agora_native_join_success", voiceOutId),
      state_connected: countMarker(logs, "state_connected", voiceOutId),
      native_connected_emit: countMarker(logs, "native_connected_emit", voiceOutId),
    },
    logs,
  };
}

async function runFinalRegression() {
  const callIds = [];
  const gates = {};
  const gateSnapshots = {};
  const gateTelemetry = {};
  let allLogs = "";
  let pipCallId = "";
  let voiceOutId = "";
  let voiceInId = "";
  let videoOutId = "";
  let videoInId = "";

  // 1 Voice outgoing
  clearLogcat();
  const vOutDial = await dialNativeOutgoing("voice");
  if (!vOutDial.ok) return { pass: false, stage: "voice_outgoing_dial", vOutDial, gateSnapshots };
  voiceOutId = vOutDial.callId;
  callIds.push(voiceOutId);
  let deadline = Date.now() + 30_000;
  let voiceOutDialing = false;
  while (Date.now() < deadline) {
    if (countMarker(readLogcat(SERIAL_A), "native_dialing_surface_shown", voiceOutId) >= 1) {
      voiceOutDialing = true;
      break;
    }
    await sleep(400);
  }
  gates.voiceOutgoing =
    voiceOutDialing &&
    singleSurfaceFromLogs(readLogcat(SERIAL_A), voiceOutId, "dialing") &&
    forbiddenOk(countForbidden(readLogcat(SERIAL_A), voiceOutId));
  saveGateSnapshot(gateSnapshots, "voiceOutgoing", voiceOutId);
  gateTelemetry.voiceOutgoing = snapshotTelemetry(gateSnapshots, "voiceOutgoing");
  tapEnd(SERIAL_A, "native_voice_call_end");
  await sleep(2000);
  await scenarioCleanupOnly();
  await settleBetweenGates();

  // 2 Voice incoming
  clearLogcat();
  await prepareCalleePushReady();
  const voiceIncomingFcmReady = await waitCalleeFcmReady();
  gateTelemetry.voiceIncomingFcmReady = voiceIncomingFcmReady;
  if (!voiceIncomingFcmReady.ok) {
    const pushSnap = path.join(OUT, "logcat-voiceIncoming-fcm-ready-b.txt");
    fs.writeFileSync(pushSnap, readPushRegisterLogcat(SERIAL_B));
    gateTelemetry.voiceIncomingFcmReady.pushRegisterLogcatB = "logcat-voiceIncoming-fcm-ready-b.txt";
    return {
      pass: false,
      stage: "harness_fcm_ready_fail",
      harnessFcmReadyFail: true,
      productRuntimeFail: false,
      fcmReady: voiceIncomingFcmReady,
      callIds: { voiceOutId, voiceInId: "", videoOutId: "", videoInId: "", pipCallId: "" },
      gates,
      gateSnapshots,
      gateTelemetry,
    };
  }
  wakeDevice(SERIAL_B);
  const vInDial = await apiDial("voice");
  if (!vInDial.ok) return { pass: false, stage: "voice_incoming_dial", vInDial, gateSnapshots };
  voiceInId = vInDial.callId;
  callIds.push(voiceInId);
  const vInIncoming = await waitIncoming(SERIAL_B, voiceInId);
  tapAccept(SERIAL_B, "native_voice_call_accept");
  const vInConnected = await waitConnectedTimed(SERIAL_B, voiceInId);
  const vInAcceptChainLogs = readLogcat(SERIAL_B);
  gates.voiceIncoming =
    vInIncoming.ok &&
    vInConnected.ok &&
    singleSurfaceFromLogs(vInAcceptChainLogs, voiceInId, "incoming");
  saveGateSnapshot(gateSnapshots, "voiceIncoming", voiceInId);
  gateTelemetry.voiceIncoming = {
    ...snapshotTelemetry(gateSnapshots, "voiceIncoming"),
    waitConnectedOk: vInConnected.ok,
    waitConnectedElapsedMs: vInConnected.elapsedMs,
    acceptChainMarkerCounts: acceptChainMarkerCounts(vInAcceptChainLogs, voiceInId, "voice"),
  };
  tapEnd(SERIAL_B, "native_voice_call_end");
  await sleep(2000);
  await scenarioCleanupOnly();
  await settleBetweenGates();

  // 3 Video outgoing (dialing surface only)
  clearLogcat();
  await warmWebView(SERIAL_A);
  const vidOutDial = await dialNativeOutgoing("video");
  if (!vidOutDial.ok) return { pass: false, stage: "video_outgoing_dial", vidOutDial, gateSnapshots };
  videoOutId = vidOutDial.callId;
  callIds.push(videoOutId);
  deadline = Date.now() + 30_000;
  let videoOutDialing = false;
  while (Date.now() < deadline) {
    if (countMarker(readLogcat(SERIAL_A), "native_dialing_surface_shown", videoOutId) >= 1) {
      videoOutDialing = true;
      break;
    }
    await sleep(400);
  }
  gates.videoOutgoing =
    videoOutDialing && singleSurfaceFromLogs(readLogcat(SERIAL_A), videoOutId, "dialing");
  saveGateSnapshot(gateSnapshots, "videoOutgoing", videoOutId);
  gateTelemetry.videoOutgoing = snapshotTelemetry(gateSnapshots, "videoOutgoing");
  tapEnd(SERIAL_A, "native_video_call_end");
  await sleep(2000);
  await scenarioCleanupOnly();
  await settleBetweenGates();

  // 4 Video incoming (B accept path only)
  clearLogcat();
  await prepareCalleePushReady();
  wakeDevice(SERIAL_B);
  const vidInDial = await apiDial("video");
  if (!vidInDial.ok) return { pass: false, stage: "video_incoming_dial", vidInDial, gateSnapshots };
  videoInId = vidInDial.callId;
  callIds.push(videoInId);
  const vidInIncoming = await waitIncoming(SERIAL_B, videoInId);
  tapAccept(SERIAL_B, "native_video_call_accept");
  const vidInConnected = await waitConnectedTimed(SERIAL_B, videoInId);
  const vidInAcceptChainLogs = readLogcat(SERIAL_B);
  gates.videoIncoming =
    vidInIncoming.ok &&
    vidInConnected.ok &&
    singleSurfaceFromLogs(vidInAcceptChainLogs, videoInId, "incoming");
  saveGateSnapshot(gateSnapshots, "videoIncoming", videoInId);
  gateTelemetry.videoIncoming = {
    ...snapshotTelemetry(gateSnapshots, "videoIncoming"),
    waitConnectedOk: vidInConnected.ok,
    waitConnectedElapsedMs: vidInConnected.elapsedMs,
    acceptChainMarkerCounts: acceptChainMarkerCounts(vidInAcceptChainLogs, videoInId, "video"),
  };
  tapEnd(SERIAL_B, "native_video_call_end");
  await sleep(2000);
  await scenarioCleanupOnly();
  await settleBetweenGates();

  // 5–7 PiP + Dock + End cleanup (A outgoing connected, B accepts)
  clearLogcat();
  await prepareCalleePushReady();
  wakeDevice(SERIAL_B);
  await warmWebView(SERIAL_A);
  const pipDial = await dialNativeOutgoing("video");
  if (!pipDial.ok) return { pass: false, stage: "pip_dock_dial", pipDial, gateSnapshots };
  pipCallId = pipDial.callId;
  callIds.push(pipCallId);
  await waitIncoming(SERIAL_B, pipCallId);
  tapAccept(SERIAL_B, "native_video_call_accept");
  const pipConnectedA = await waitConnected(SERIAL_A, pipCallId);
  const pipConnectedB = await waitConnected(SERIAL_B, pipCallId);
  if (!pipConnectedA.ok || !pipConnectedB.ok) {
    return { pass: false, stage: "pip_dock_connected", pipCallId, pipConnectedA, pipConnectedB, gateSnapshots };
  }
  wakeDevice(SERIAL_A);
  await ensureNativeVideoForeground(SERIAL_A, pipCallId, "outgoing");
  await waitConnectedUi(SERIAL_A);
  await sleep(800);

  const pip = await tryPipRestore(SERIAL_A, pipCallId);
  gates.pip = pip.ok;
  saveGateSnapshot(gateSnapshots, "pip", pipCallId);
  gateTelemetry.pip = snapshotTelemetry(gateSnapshots, "pip");

  wakeDevice(SERIAL_A);
  await ensureNativeVideoForeground(SERIAL_A, pipCallId, "outgoing");
  await waitConnectedUi(SERIAL_A);
  await sleep(800);

  const dockMin = await tapDockMinimize(SERIAL_A);
  await sleep(900);
  const dockShown = countMarker(readLogcat(SERIAL_A), "native_video_dock_shown", pipCallId) >= 1;
  const dockResumeTap = tapByResourceId(SERIAL_A, "native_call_dock_resume");
  await sleep(900);
  const dockResume =
    countMarker(readLogcat(SERIAL_A), "native_video_dock_resume", pipCallId) >= 1 &&
    countMarker(readLogcat(SERIAL_A), "native_video_dock_hidden", pipCallId) >= 1;
  gates.dock = dockMin.ok && dockShown && dockResumeTap.ok && dockResume;
  saveGateSnapshot(gateSnapshots, "dock", pipCallId);
  gateTelemetry.dock = snapshotTelemetry(gateSnapshots, "dock");

  await tapDockMinimize(SERIAL_A);
  await sleep(700);
  tapByResourceId(SERIAL_A, "native_call_dock_end");
  await sleep(1500);
  const endTapped = countMarker(readLogcat(SERIAL_A), "end_tapped", pipCallId) >= 1;
  const o4 = endTapped ? await waitO4(SERIAL_A, pipCallId) : { ok: false };
  gates.endCleanup = endTapped && o4.ok;
  saveGateSnapshot(gateSnapshots, "endCleanup", pipCallId);
  gateTelemetry.endCleanup = snapshotTelemetry(gateSnapshots, "endCleanup");

  allLogs = `${readLogcat(SERIAL_A)}\n---\n${readLogcat(SERIAL_B)}`;
  const forbidden = countForbidden(allLogs, callIds);
  gates.forbiddenZero = forbiddenOk(forbidden);
  gates.callV4ScreenZero = forbidden.CallV4Screen === 0;
  gates.singleNativeSurface =
    gates.voiceOutgoing &&
    gates.voiceIncoming &&
    gates.videoOutgoing &&
    gates.videoIncoming;

  const aggregateSnap = saveGateSnapshot(gateSnapshots, "forbiddenZero", pipCallId);
  gateSnapshots.callV4ScreenZero = { ...aggregateSnap, callIds: { voiceOutId, voiceInId, videoOutId, videoInId, pipCallId } };
  gateSnapshots.singleNativeSurface = { ...aggregateSnap, callIds: { voiceOutId, voiceInId, videoOutId, videoInId, pipCallId } };
  gateTelemetry.forbiddenZero = snapshotTelemetry(gateSnapshots, "forbiddenZero");
  gateTelemetry.callV4ScreenZero = snapshotTelemetry(gateSnapshots, "callV4ScreenZero");
  gateTelemetry.singleNativeSurface = snapshotTelemetry(gateSnapshots, "singleNativeSurface");

  const pass = Object.entries(gates).every(([, v]) => v === true);

  return {
    pass,
    callIds: { voiceOutId, voiceInId, videoOutId, videoInId, pipCallId },
    gates,
    forbidden,
    pip,
    dockMin,
    dockShown,
    dockResume,
    endTapped,
    o4,
    gateSnapshots,
    gateTelemetry,
    logs: allLogs,
  };
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  loadEnvLocal();
  console.log(`[final-reg] A=${SERIAL_A} B=${SERIAL_B}`);
  await resetBetween();
  await ensureLogin();
  launchApkMainActivity(adbObj, SERIAL_A, ACT);
  launchApkMainActivity(adbObj, SERIAL_B, ACT);
  await sleep(2000);

  if (process.env.NATIVE_REG_VOICE_OUT_ONLY === "1") {
    const result = await runVoiceOutgoingOnly();
    if (result.logs) {
      fs.writeFileSync(
        path.join(OUT, `logcat-voice-outgoing-${result.callId || "none"}.txt`),
        result.logs,
      );
      delete result.logs;
    }
    const report = {
      at: new Date().toISOString(),
      serialA: SERIAL_A,
      mode: "voiceOutgoing_only",
      harness: ".qa-logs/native-call-final-regression.mjs",
      result,
      overallPass: Boolean(result.pass),
    };
    fs.writeFileSync(path.join(OUT, "report-voice-outgoing-only.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await scenarioCleanupOnly();
    process.exit(report.overallPass ? 0 : 1);
  }

  const result = await runFinalRegression();
  if (result.logs) {
    fs.writeFileSync(path.join(OUT, "logcat-final-regression.txt"), result.logs);
    delete result.logs;
  }
  await scenarioCleanupOnly();

  const report = {
    at: new Date().toISOString(),
    serialA: SERIAL_A,
    serialB: SERIAL_B,
    harness: ".qa-logs/native-call-final-regression.mjs",
    gates: result.gates,
    gateSnapshots: result.gateSnapshots ?? {},
    gateTelemetry: result.gateTelemetry ?? {},
    harnessFcmReadyFail: Boolean(result.harnessFcmReadyFail),
    productRuntimeFail: result.productRuntimeFail ?? !result.pass,
    result,
    overallPass: Boolean(result.pass),
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.overallPass ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
