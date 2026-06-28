#!/usr/bin/env node
/** voiceOutgoing isolated diagnostic — step 1 only */
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
} from "../scripts/qa/lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(
  ROOT,
  ".qa-logs",
  process.argv.includes("--video") ? "native-call-video-outgoing-isolated" : "native-call-voice-outgoing-isolated",
);
const MEDIA = process.argv.includes("--video") ? "video" : "voice";
const CALL_KIND = MEDIA;
const MEDIA_TYPE = MEDIA === "video" ? "video" : "voice";
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = DIBAY_PKG;
const ACT = `${PKG}/.MainActivity`;
const WEB = process.env.CAPACITOR_SERVER_URL?.trim() || "https://samarket.vercel.app";
const SERIAL_A = process.env.P4_DEVICE_A?.trim() || "8b37179f7d94";
const SERIAL_B = process.env.P4_DEVICE_B?.trim() || "RRGL4046NTW";
const ROOM_ID = "b19e2672-f26f-4a2e-8125-52575da4a62a";
const USER_B = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const CDP_A = 9223;
const PASSWORD = process.env.E2E_TEST_PASSWORD?.trim() || "1234";

const FORBIDDEN = [
  "route_to_screen",
  "outgoing_ringing",
  "CallV4Screen",
];
const RED_PASS = [
  "caller_outgoing_start",
  "token_fetch_done",
  "agora_native_join_success",
  "state_connected",
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

function lineHasCallId(line, callId) {
  if (!callId) return false;
  if (line.includes(callId)) return true;
  const compact = callId.replace(/-/g, "");
  return compact.length >= 8 && line.includes(compact);
}

function linesForCall(logs, callId) {
  return logs.split("\n").filter((l) => lineHasCallId(l, callId));
}

function countMarker(logs, marker, callId) {
  return logs.split("\n").filter((l) => l.includes(marker) && lineHasCallId(l, callId)).length;
}

function countForbidden(logs, callId) {
  return Object.fromEntries(
    FORBIDDEN.map((m) => [m, logs.split("\n").filter((l) => l.includes(m) && lineHasCallId(l, callId)).length]),
  );
}

function countWebForbidden(logs, callId) {
  const lines = logs.split("\n");
  const web = (l) =>
    lineHasCallId(l, callId) &&
    (l.includes("DIBAY_CALL_V4") || l.includes("Capacitor/Console") || l.includes("DIBAY_WebView"));
  return {
    route_to_screen: lines.filter((l) => web(l) && l.includes("route_to_screen")).length,
    outgoing_ringing: lines.filter((l) => web(l) && l.includes("outgoing_ringing")).length,
    CallV4Screen: lines.filter((l) => lineHasCallId(l, callId) && l.includes("CallV4Screen")).length,
    agora_join_start: lines.filter(
      (l) => web(l) && l.includes("agora_join_start") && !l.includes("agora_native_join_start"),
    ).length,
    agora_join_success: lines.filter(
      (l) => web(l) && l.includes("agora_join_success") && !l.includes("agora_native_join_success"),
    ).length,
  };
}

function activityCount(serial, activityName) {
  const out = adb(serial, "shell", "dumpsys", "activity", "activities");
  return (out.match(new RegExp(`ActivityRecord\\{[^}]*${activityName}`, "g")) || []).length;
}

function extractMarkers(lines, markers) {
  const hits = {};
  for (const m of markers) hits[m] = lines.filter((l) => l.includes(m)).map((l) => l.trim());
  return hits;
}

function firstFailReason(checks) {
  if (!checks.dialOk) return "dialNativeOutgoing returned ok=false";
  if (checks.firstMissingMarker) return `missing_${checks.firstMissingMarker}`;
  if (!checks.forbiddenOk) return `forbidden: ${JSON.stringify(checks.forbiddenWeb)}`;
  return null;
}

function lastPassMarker(nativeCounts) {
  for (let i = RED_PASS.length - 1; i >= 0; i--) {
    const m = RED_PASS[i];
    if ((nativeCounts[m] ?? 0) >= 1) return m;
  }
  return null;
}

function firstMissingMarker(nativeCounts) {
  for (const m of RED_PASS) {
    if ((nativeCounts[m] ?? 0) < 1) return m;
  }
  return null;
}

async function buildAuth(login, expectedUserId) {
  const { cookies, userId } = await buildApkSessionCookies({
    login,
    prod: WEB,
    password: PASSWORD,
    loadEnv: loadEnvLocal,
  });
  if (userId !== expectedUserId) throw new Error("auth_mismatch");
  return {
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
  };
}

async function scenarioCleanupOnly() {
  for (const login of ["aaaa", "qqqq"]) {
    try {
      const auth = await buildAuth(login, login === "aaaa" ? "11111111-1111-1111-1111-111111111111" : "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8");
      await fetch(`${WEB}/api/community-messenger/calls/active/end-all`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: auth.cookie },
        body: "{}",
      });
    } catch {
      /* noop */
    }
  }
}

async function warmWebView(serial) {
  launchApkMainActivity(adbObj, serial, ACT);
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    if (discoverWebViewSocket(adbObj, serial)) return true;
  }
  return false;
}

async function dialNativeOutgoingVoice() {
  if (!(await warmWebView(SERIAL_A))) throw new Error("webview_timeout");
  forwardCdp(adbObj, SERIAL_A, CDP_A);
  const { browser, page } = await connectWebView(chromium, CDP_A);
  try {
    const { cookies } = await buildApkSessionCookies({
      login: "aaaa",
      prod: WEB,
      password: PASSWORD,
      loadEnv: loadEnvLocal,
    });
    await page.context().addCookies(cookies);
    await navigateApkWebView(page, `${WEB}/community-messenger/rooms/${ROOM_ID}`, 10_000);
    await sleep(2000);
    return await page.evaluate(
      async ({ roomId, peerUserId, callKind, mediaType }) => {
        const res = await fetch(`/api/community-messenger/rooms/${roomId}/calls`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ callKind, dialIntent: "fresh" }),
        });
        const json = await res.json().catch(() => ({}));
        const callId = json?.callId ?? "";
        if (!callId) return { ok: false, reason: "api_no_call_id", status: res.status };
        const cap = window.Capacitor?.Plugins?.NativeCallService;
        if (!cap?.startNativeOutgoingEstablishment) return { ok: false, reason: "no_native_plugin", callId };
        const native = await cap.startNativeOutgoingEstablishment({
          callId,
          roomId,
          mediaType,
          peerUserId,
          peerName: "peer",
        });
        return { ok: Boolean(native?.nativeOwned ?? native?.ok), callId, native };
      },
      { roomId: ROOM_ID, peerUserId: USER_B, callKind: CALL_KIND, mediaType: MEDIA_TYPE },
    );
  } finally {
    await browser.close().catch(() => {});
    adbObj(SERIAL_A, "forward", "--remove", `tcp:${CDP_A}`);
  }
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  loadEnvLocal();
  await scenarioCleanupOnly();
  await sleep(1500);
  adbObj(SERIAL_A, "shell", "am", "force-stop", PKG);
  adbObj(SERIAL_B, "shell", "am", "force-stop", PKG);
  await sleep(1200);
  await ensureApkWebViewLogin({
    adb: adbObj,
    chromium,
    serial: SERIAL_A,
    cdpPort: CDP_A,
    act: ACT,
    pkg: PKG,
    prod: WEB,
    login: "aaaa",
    expectedUserId: "11111111-1111-1111-1111-111111111111",
    loadEnv: loadEnvLocal,
    password: PASSWORD,
    log: (m) => console.log(`[vout] ${m}`),
    label: "A",
    restartForFcm: false,
  });

  adb(SERIAL_A, "logcat", "-c");
  adb(SERIAL_B, "logcat", "-c");

  const dial = await dialNativeOutgoingVoice();
  const callId = dial.callId ?? "";

  let connected = false;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (countMarker(readLogcat(SERIAL_A), "state_connected", callId) >= 1) {
      connected = true;
      break;
    }
    await sleep(500);
  }

  await sleep(1500);
  const logsA = readLogcat(SERIAL_A);
  const logsB = readLogcat(SERIAL_B);
  const logsFull = `${logsA}\n---DEVICE_B---\n${logsB}`;
  const callLines = linesForCall(logsFull, callId);

  const nativeMarkerCounts = Object.fromEntries(
    RED_PASS.map((m) => [m, countMarker(logsFull, m, callId)]),
  );
  const forbiddenWeb = countWebForbidden(logsFull, callId);
  const missing = firstMissingMarker(nativeMarkerCounts);

  const checks = {
    dialOk: dial.ok,
    connected,
    firstMissingMarker: missing,
    forbiddenOk: Object.values(forbiddenWeb).every((n) => n === 0),
  };

  const harnessPass = checks.dialOk && checks.connected && !missing && checks.forbiddenOk;
  const failReason = firstFailReason({ ...checks, forbiddenWeb });

  const report = {
    at: new Date().toISOString(),
    scenario: MEDIA === "video" ? "videoOutgoing_isolated" : "voiceOutgoing_isolated",
    callId,
    dial,
    checks,
    forbiddenWeb,
    nativeMarkerCounts,
    firstMissingMarker: missing,
    lastPassMarker: lastPassMarker(nativeMarkerCounts),
    harnessFailReason: failReason,
    harnessPass,
  };

  fs.writeFileSync(path.join(OUT, `logcat-full-${callId || "none"}.txt`), readLogcatFull(SERIAL_A));
  fs.writeFileSync(path.join(OUT, `logcat-filtered-${callId || "none"}.txt`), logsFull);
  fs.writeFileSync(path.join(OUT, `logcat-call-lines-${callId || "none"}.txt`), callLines.join("\n"));
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(harnessPass ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
