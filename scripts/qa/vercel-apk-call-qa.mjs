#!/usr/bin/env node
/**
 * Vercel-origin APK 2-device call QA (aaaa caller / qqqq callee).
 * CDP로 WebView 세션 고정 후 foreground / background / screen_off / video 검증.
 * Usage: node scripts/qa/vercel-apk-call-qa.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import {
  DIBAY_PKG,
  ensureApkWebViewLogin,
} from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = DIBAY_PKG;
const ACT = `${PKG}/.MainActivity`;
const SERIAL_A = process.env.P4_DEVICE_A?.trim() || "8b37179f7d94";
const SERIAL_B = process.env.P4_DEVICE_B?.trim() || "RFCY40PY2CA";
const VERCEL = process.env.CAPACITOR_SERVER_URL?.trim() || "https://samarket.vercel.app";
const LOG_DIR = path.join(ROOT, "docs/perf");
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = process.env.P4_PEER_USER_ID?.trim() || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const CDP_A = Number(process.env.P4_CDP_PORT_A || 9223);
const CDP_B = Number(process.env.P4_CDP_PORT_B || 9224);
const PASSWORD = process.env.E2E_TEST_PASSWORD?.trim() || "1234";

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" }).stdout ?? "";
}

function adbFull(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function wake(serial) {
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "input", "keyevent", "82");
}

async function openAppPath(serial, appPath) {
  const url = `${VERCEL}${appPath.startsWith("/") ? appPath : `/${appPath}`}`;
  adbFull(serial, "shell", "am", "start", "-n", ACT, "-a", "android.intent.action.VIEW", "-d", url, "-p", PKG);
  await sleep(1200);
}

function log(line) {
  console.log(`[vercel-apk-call-qa] ${line}`);
}

function adbObj(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function lastPushRegisterUserId(logText) {
  const matches = [...logText.matchAll(/DIBAY_PUSH_REGISTER.*"user_id":"([^"]+)"/g)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

function hasRingMarker(text) {
  return (
    text.includes("ring_start") ||
    text.includes("ringtone_start_native") ||
    text.includes("source=native_foreground")
  );
}

async function openCall(serial, sessionId, query = "") {
  const q = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  adbFull(
    serial,
    "shell",
    "am",
    "start",
    "-n",
    ACT,
    "-a",
    "android.intent.action.VIEW",
    "-d",
    `dibay://call/${encodeURIComponent(sessionId)}${q}`
  );
  await sleep(800);
}

function logcatDump(serial) {
  return adb(serial, "logcat", "-d");
}

function logcatClear(serial) {
  adb(serial, "logcat", "-c");
}

function has(text, needle) {
  return text.includes(needle);
}

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
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function signInEmail(email) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const password = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login failed ${email}: ${error?.message}`);
  return data.session.user.id;
}

function supabaseAdmin() {
  loadEnvLocal();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
    { auth: { persistSession: false } }
  );
}

async function waitCallRow(initiatorId, recipientId, sinceIso, timeoutMs = 60_000) {
  const sb = supabaseAdmin();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await sb
      .from("community_messenger_call_sessions")
      .select("id, status, initiator_user_id, recipient_user_id")
      .eq("initiator_user_id", initiatorId)
      .eq("recipient_user_id", recipientId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data;
    await sleep(2000);
  }
  return null;
}

async function ensureDeviceLogins() {
  const adbFn = (serial, ...args) => adbObj(serial, ...args);
  log(`ensure login A=${SERIAL_A} aaaa (${USER_A})`);
  const loginA = await ensureApkWebViewLogin({
    adb: adbFn,
    chromium,
    serial: SERIAL_A,
    cdpPort: CDP_A,
    act: ACT,
    pkg: PKG,
    prod: VERCEL,
    login: "aaaa",
    expectedUserId: USER_A,
    loadEnv: loadEnvLocal,
    password: PASSWORD,
    log,
    label: "device-A",
    restartForFcm: true,
  });
  if (!loginA.ok) throw new Error(`device A login failed: ${JSON.stringify(loginA.probe)}`);

  log(`ensure login B=${SERIAL_B} qqqq (${USER_B})`);
  const loginB = await ensureApkWebViewLogin({
    adb: adbFn,
    chromium,
    serial: SERIAL_B,
    cdpPort: CDP_B,
    act: ACT,
    pkg: PKG,
    prod: VERCEL,
    login: "qqqq",
    expectedUserId: USER_B,
    loadEnv: loadEnvLocal,
    password: PASSWORD,
    log,
    label: "device-B",
    restartForFcm: true,
  });
  if (!loginB.ok) throw new Error(`device B login failed: ${JSON.stringify(loginB.probe)}`);

  const regA = lastPushRegisterUserId(loginA.registerLogcat);
  const regB = lastPushRegisterUserId(loginB.registerLogcat);
  if (regA !== USER_A) throw new Error(`device A FCM user mismatch: ${regA} expected ${USER_A}`);
  if (regB !== USER_B) throw new Error(`device B FCM user mismatch: ${regB} expected ${USER_B}`);
  log(`FCM register OK A=${regA} B=${regB}`);
}

async function runRound(label, kind, initiatorId, recipientId, bgMode) {
  const result = { label, kind, bgMode, pass: false, callId1: null, callId2: null, notes: [] };
  logcatClear(SERIAL_A);
  logcatClear(SERIAL_B);

  const start1 = new Date().toISOString();
  wake(SERIAL_A);
  wake(SERIAL_B);
  await openAppPath(SERIAL_B, "/community-messenger?section=chats");
  if (bgMode === "background") adb(SERIAL_B, "shell", "input", "keyevent", "3");
  if (bgMode === "screen_off") adb(SERIAL_B, "shell", "input", "keyevent", "26");
  await sleep(2000);

  const tmp1 = `tmp_qa_${Date.now()}`;
  await openCall(SERIAL_A, tmp1, `kind=${kind}&peerUserId=${encodeURIComponent(recipientId)}`);
  const row1 = await waitCallRow(initiatorId, recipientId, start1);
  result.callId1 = row1?.id ?? null;
  if (!result.callId1) {
    result.notes.push("call1_no_db_row");
    return result;
  }
  if (row1?.initiator_user_id && row1.initiator_user_id !== initiatorId) {
    result.notes.push(`call1_wrong_initiator=${row1.initiator_user_id}`);
    return result;
  }

  await sleep(4000);
  let logsB = logcatDump(SERIAL_B);
  const logsA = logcatDump(SERIAL_A);
  const callerUser = lastPushRegisterUserId(logsA);
  if (callerUser && callerUser !== initiatorId) {
    result.notes.push(`caller_wrong_user=${callerUser}`);
  }
  if (!has(logsB, "incoming_call_received") && !has(logsB, "incoming_received")) {
    result.notes.push("call1_no_incoming_signal");
  }
  if (!hasRingMarker(logsB)) {
    result.notes.push("call1_no_ring");
  }
  if (!has(logsB, "incoming_presenter_decision") && !has(logsB, "incoming_poll_hit")) {
    result.notes.push("call1_no_incoming_ui_poll");
  }
  if (has(logsB, "NativeIncomingCall.then()")) {
    result.notes.push("native_incoming_call_then_crash");
  }

  wake(SERIAL_B);
  if (bgMode === "screen_off") adb(SERIAL_B, "shell", "input", "keyevent", "26");
  await openCall(SERIAL_B, result.callId1, "action=accept");
  await sleep(12000);

  const merged1 = logcatDump(SERIAL_A) + logcatDump(SERIAL_B);
  if (!has(merged1, "agora") && !has(merged1, "Agora") && !has(merged1, "remote_joined")) {
    result.notes.push("call1_media_uncertain");
  }

  wake(SERIAL_A);
  await openCall(SERIAL_A, result.callId1);
  await sleep(2000);
  adb(SERIAL_A, "shell", "input", "keyevent", "4");
  await sleep(4000);

  if (
    !has(logcatDump(SERIAL_A), "release_local_call_lifecycle") &&
    !has(logcatDump(SERIAL_A), "lifecycle=release_local_call_lifecycle")
  ) {
    result.notes.push("call1_no_lifecycle_release");
  }

  const start2 = new Date().toISOString();
  const tmp2 = `tmp_qa_${Date.now()}_2`;
  await openCall(SERIAL_A, tmp2, `kind=${kind}&peerUserId=${encodeURIComponent(recipientId)}`);
  const row2 = await waitCallRow(initiatorId, recipientId, start2);
  result.callId2 = row2?.id ?? null;
  if (!result.callId2) {
    result.notes.push("call2_no_db_row_redial_blocked");
    return result;
  }
  if (result.callId2 === result.callId1) {
    result.notes.push("call2_same_id_as_call1");
  }

  await sleep(5000);
  logsB = logcatDump(SERIAL_B);
  if (!has(logsB, result.callId2) && !has(logsB, "incoming_received")) {
    result.notes.push("call2_no_incoming_signal");
  }

  result.pass =
    Boolean(result.callId1 && result.callId2 && result.callId1 !== result.callId2) &&
    !result.notes.some(
      (n) =>
        n.includes("redial_blocked") ||
        n.includes("no_incoming_signal") ||
        n.includes("no_ring") ||
        n.includes("wrong_initiator") ||
        n.includes("wrong_user") ||
        n.includes("native_incoming_call_then")
    );
  return result;
}

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const initiatorId = USER_A;
  const recipientId = USER_B;

  for (const perm of [
    "android.permission.RECORD_AUDIO",
    "android.permission.CAMERA",
    "android.permission.POST_NOTIFICATIONS",
  ]) {
    adb(SERIAL_A, "shell", "pm", "grant", PKG, perm);
    adb(SERIAL_B, "shell", "pm", "grant", PKG, perm);
  }

  await ensureDeviceLogins();

  const results = [];
  results.push(await runRound("voice_foreground", "voice", initiatorId, recipientId, "foreground"));
  results.push(await runRound("voice_background", "voice", initiatorId, recipientId, "background"));
  results.push(await runRound("voice_screen_off", "voice", initiatorId, recipientId, "screen_off"));
  results.push(await runRound("video_foreground", "video", initiatorId, recipientId, "foreground"));

  const callerLog = logcatDump(SERIAL_A);
  const calleeLog = logcatDump(SERIAL_B);
  fs.writeFileSync(path.join(LOG_DIR, "caller-call.log"), callerLog);
  fs.writeFileSync(path.join(LOG_DIR, "callee-call.log"), calleeLog);

  const report = {
    vercel: VERCEL,
    accounts: { caller: { login: "aaaa", userId: initiatorId }, callee: { login: "qqqq", userId: recipientId } },
    devices: { caller: SERIAL_A, callee: SERIAL_B },
    results,
    passCount: results.filter((r) => r.pass).length,
    total: results.length,
    markers: {
      lifecycle:
        has(callerLog, "release_local_call_lifecycle") ||
        has(callerLog, "lifecycle=release_local_call_lifecycle"),
      nativeWake: has(calleeLog, "incoming_native_wake_mark"),
      pollCorrelation: has(calleeLog, "incoming_poll_correlation"),
      presenterOk: has(calleeLog, "incoming_presenter_decision") && has(calleeLog, '"reason":"ok"'),
      fcmReceived: has(calleeLog, "incoming_call_received"),
      ringStart: hasRingMarker(calleeLog),
      deliveryAt: has(calleeLog, "deliveryAt="),
      nativeThenCrash: has(calleeLog, "NativeIncomingCall.then()"),
    },
  };
  const out = path.join(LOG_DIR, "vercel-apk-call-qa-report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passCount === report.total ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
