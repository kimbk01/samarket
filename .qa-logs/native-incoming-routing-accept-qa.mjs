#!/usr/bin/env node
/**
 * Native incoming Accept routing QA (Telegram-aligned Activity Accept).
 *
 * P0 (Gate blocking): Voice/Video × fsi_button | foreground_button → Connected
 * Reference (non-blocking): voice/video banner shade Accept — recorded only
 *
 *   ROUTING_QA_GATE=p0        — Release 2 Final Gate (P0 only)
 *   ROUTING_QA_GATE=reference — reference tier only
 *   ROUTING_QA_ONLY=<id>      — single scenario
 *
 * Doc: .qa-logs/native-incoming-routing-accept-qa/README.md
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import {
  ensureApkWebViewLogin,
  launchApkMainActivity,
  restartApkForPushRegister,
} from "../scripts/qa/lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, ".qa-logs", "native-incoming-routing-accept-qa");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const ACT = `${PKG}/.MainActivity`;
const WEB = process.env.CAPACITOR_SERVER_URL?.trim() || "https://samarket.vercel.app";
const SERIAL_A = process.env.P4_DEVICE_A?.trim() || "8b37179f7d94";
const SERIAL_B = process.env.P4_DEVICE_B?.trim() || "RRGL4046NTW";
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const ROOM_ID = "b19e2672-f26f-4a2e-8125-52575da4a62a";
const PASSWORD = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
const CDP_A = 9223;
const CDP_B = 9224;

const SCENARIOS = [
  {
    id: "voice_fsi_button_accept",
    media: "voice",
    path: "fsi_button",
    tier: "p0",
    label: "Voice FSI → Activity Accept → Connected",
  },
  {
    id: "voice_foreground_button_accept",
    media: "voice",
    path: "foreground_button",
    tier: "p0",
    label: "Voice Foreground → Activity Accept → Connected",
  },
  {
    id: "video_fsi_button_accept",
    media: "video",
    path: "fsi_button",
    tier: "p0",
    label: "Video FSI → Activity Accept → Connected",
  },
  {
    id: "video_foreground_button_accept",
    media: "video",
    path: "foreground_button",
    tier: "p0",
    label: "Video Foreground → Activity Accept → Connected",
  },
  {
    id: "voice_banner_accept",
    media: "voice",
    path: "banner",
    tier: "reference",
    label: "Notification Shade Accept (informational)",
  },
  {
    id: "video_banner_accept",
    media: "video",
    path: "banner",
    tier: "reference",
    label: "Notification Shade Accept (informational)",
  },
];

function scenarioMeta(scenario) {
  return {
    scenario: scenario.id,
    tier: scenario.tier,
    label: scenario.label,
    blocksGate: scenario.tier === "p0",
    media: scenario.media,
    path: scenario.path,
  };
}

function scenarioFail(scenario, partial) {
  return { ...scenarioMeta(scenario), pass: false, ...partial };
}

function resolveScenarioList() {
  const only = process.env.ROUTING_QA_ONLY?.trim();
  if (only) {
    const ids = only.split(",").map((s) => s.trim()).filter(Boolean);
    return SCENARIOS.filter((s) => ids.includes(s.id));
  }
  const gate = (process.env.ROUTING_QA_GATE ?? "full").trim().toLowerCase();
  if (gate === "p0") return SCENARIOS.filter((s) => s.tier === "p0");
  if (gate === "reference") return SCENARIOS.filter((s) => s.tier === "reference");
  return SCENARIOS;
}

function adbObj(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
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
    "DIBAY_NATIVE_CALL:I",
    "DIBAY_CALL:I",
    "DIBAY_FCM:I",
    "*:S",
  );
}

function lineHasCallId(line, callId) {
  if (!callId) return false;
  return line.includes(callId) || line.includes(callId.replace(/-/g, ""));
}

function countMarker(logs, marker, callId) {
  return logs.split("\n").filter((l) => l.includes(marker) && lineHasCallId(l, callId)).length;
}

function orderedMarkers(logs, callId, markers) {
  const lines = logs.split("\n").filter((l) => lineHasCallId(l, callId));
  const indices = markers.map((m) => {
    const idx = lines.findIndex((l) => l.includes(m));
    return { marker: m, idx };
  });
  return indices;
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

async function buildAuth(login, expectedUserId) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const loginEmail = login.includes("@") ? login : `${login}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail, password: PASSWORD });
  if (error || !data.session) throw new Error(`login ${loginEmail}: ${error?.message ?? "no session"}`);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const host = new URL(WEB).hostname;
  const cookie = `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify(data.session))}`;
  if (data.session.user.id !== expectedUserId) throw new Error("auth_mismatch");
  return { cookie, userId: data.session.user.id };
}

async function endAllCalls() {
  for (const login of ["aaaa", "qqqq"]) {
    try {
      const auth = await buildAuth(login, login === "aaaa" ? USER_A : USER_B);
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

async function ensureLoginBoth() {
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
      log: (m) => console.log(`[routing-qa] ${label} ${m}`),
      label,
      restartForFcm: false,
    });
    if (!result.ok) throw new Error(`login_${label}_fail`);
  }
}

async function prepCalleePushReady() {
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

async function prepForeground(serial) {
  adbObj(serial, "shell", "input", "keyevent", "224");
  await sleep(400);
  adbObj(serial, "shell", "wm", "dismiss-keyguard");
  adbObj(
    serial,
    "shell",
    "am",
    "start",
    "-n",
    ACT,
    "-a",
    "android.intent.action.VIEW",
    "-d",
    `${WEB}/community-messenger`,
    "-p",
    PKG,
  );
  await sleep(3500);
}

async function prepBackground(serial) {
  await prepForeground(serial);
  adbObj(serial, "shell", "input", "keyevent", "3");
  await sleep(1800);
}

/** Banner accept: screen off / keyguard — FSI auto-send skipped, notification actions stay reachable. */
async function prepLockSleep(serial) {
  adbObj(serial, "shell", "cmd", "statusbar", "collapse");
  adbObj(serial, "shell", "input", "keyevent", "3");
  await sleep(500);
  adbObj(serial, "shell", "input", "keyevent", "26");
  await sleep(1800);
}

function dumpUi(serial, file = "/sdcard/routing-uidump.xml") {
  adbObj(serial, "shell", "uiautomator", "dump", file);
  return adb(serial, "shell", "cat", file);
}

function tapByPatterns(serial, patterns, opts = {}) {
  const minCenterY = opts.minCenterY ?? 0;
  const xml = dumpUi(serial);
  for (const re of patterns) {
    const m = xml.match(re);
    if (!m) continue;
    const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
    const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
    if (x <= 1 || y <= 1 || y < minCenterY) continue;
    adb(serial, "shell", "input", "tap", String(x), String(y));
    return { ok: true, x, y };
  }
  return { ok: false };
}

function tapActivityAccept(serial, media) {
  adbObj(serial, "shell", "input", "keyevent", "224");
  adbObj(serial, "shell", "input", "keyevent", "82");
  const rid =
    media === "video"
      ? `${PKG}:id/native_video_call_accept`
      : `${PKG}:id/native_voice_call_accept`;
  const esc = rid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tapByPatterns(serial, [
    new RegExp(`${esc}[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`),
    /content-desc="[^"]*(?:수락|Accept)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
  ]);
}

const NOTIFICATION_ACCEPT_PATTERNS = [
  /(?:text|content-desc)="[^"]*(?:Accept|수락|Answer|받기)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
  /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*(?:text|content-desc)="[^"]*(?:Accept|수락|Answer|받기)[^"]*"/i,
];

async function tapNotificationAccept(serial, { expandShade = true, maxCenterY = 900 } = {}) {
  const tryPatternsOnXml = (xml) => {
    for (const re of NOTIFICATION_ACCEPT_PATTERNS) {
      const m = xml.match(re);
      if (!m) continue;
      const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
      const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
      if (x <= 1 || y <= 1 || y < 80 || y > maxCenterY) continue;
      if (xml.includes("native_voice_call_accept") || xml.includes("native_video_call_accept")) {
        const act = xml.match(/native_(?:voice|video)_call_accept[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
        if (act) {
          const ay = Math.floor((Number(act[2]) + Number(act[4])) / 2);
          if (Math.abs(ay - y) < 40) continue;
        }
      }
      adb(serial, "shell", "input", "tap", String(x), String(y));
      return { ok: true, x, y };
    }
    return { ok: false };
  };

  if (expandShade) {
    const size = adb(serial, "shell", "wm", "size");
    const sm = size.match(/(\d+)x(\d+)/);
    const w = Number(sm?.[1] ?? 1080);
    adbObj(serial, "shell", "input", "swipe", String(Math.floor(w / 2)), "0", String(Math.floor(w / 2)), "900", "180");
    await sleep(200);
    adbObj(serial, "shell", "cmd", "statusbar", "expand-notifications");
    await sleep(350);
    let xml = dumpUi(serial);
    const rowRe =
      /(?:text|content-desc)="[^"]*(?:DIBAY|Incoming|voice|video|aaaa|qqqq)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i;
    const row = xml.match(rowRe);
    if (row) {
      const rx = Math.floor((Number(row[1]) + Number(row[3])) / 2);
      const ry = Math.floor((Number(row[2]) + Number(row[4])) / 2);
      if (ry < maxCenterY) {
        adb(serial, "shell", "input", "tap", String(rx), String(ry));
        await sleep(300);
        xml = dumpUi(serial);
      }
    }
    const tap = tryPatternsOnXml(xml);
    if (tap.ok) return { ok: true, method: "shade", ...tap };
    const declineRe =
      /(?:text|content-desc)="(?:Decline|거절|거부|Reject)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i;
    const decline = xml.match(declineRe);
    if (decline) {
      const left = Number(decline[1]);
      const top = Number(decline[2]);
      const bottom = Number(decline[4]);
      const y = Math.floor((top + bottom) / 2);
      for (const x of [left - 100, left - 180, left - 60]) {
        if (x > 40 && y < maxCenterY) {
          adb(serial, "shell", "input", "tap", String(x), String(y));
          return { ok: true, method: "shade_decline_offset", x, y };
        }
      }
    }
    return { ok: false, xmlSnippet: xml.slice(0, 600) };
  }

  await sleep(80);
  const tap = tryPatternsOnXml(dumpUi(serial));
  if (tap.ok) return { ok: true, method: "heads_up", ...tap };
  return { ok: false, xmlSnippet: dumpUi(serial).slice(0, 600) };
}

function markerTimestampMs(line) {
  const m = line.match(/^\d{2}-\d{2} (\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!m) return null;
  return (
    Number(m[1]) * 3_600_000 +
    Number(m[2]) * 60_000 +
    Number(m[3]) * 1_000 +
    Number(m[4])
  );
}

function firstMarkerTimestamp(logs, marker, callId) {
  for (const line of logs.split("\n")) {
    if (!line.includes(marker) || !lineHasCallId(line, callId)) continue;
    const ts = markerTimestampMs(line);
    if (ts != null) return ts;
  }
  return null;
}

function evaluateGraceAndDuplicateUi(logs, callId, path) {
  const activityTs = firstMarkerTimestamp(logs, "incoming_activity_shown", callId);
  const suppressTs = firstMarkerTimestamp(logs, "notification_visual_suppressed", callId);
  const graceScheduled = countMarker(logs, "incoming_notification_suppress_grace_scheduled", callId);
  const graceElapsed = countMarker(logs, "incoming_notification_suppress_grace_elapsed", callId);
  const graceSkipped = countMarker(logs, "incoming_notification_suppress_grace_skipped", callId);
  const notifAccept = countMarker(logs, "activity_notification_accept", callId);

  let pass = true;
  let firstFail = null;

  if (path === "banner" && graceScheduled < 1 && activityTs != null) {
    pass = false;
    firstFail = "suppress_grace_not_scheduled";
  }

  if (activityTs != null && suppressTs != null) {
    const gapMs = suppressTs - activityTs;
    if (notifAccept >= 1 && graceSkipped >= 1) {
      // Accept during grace — duplicate UI cleared via connected path.
    } else if (gapMs < 700) {
      pass = false;
      firstFail = firstFail ?? "duplicate_ui_suppressed_too_fast";
    } else if (path !== "banner" && graceScheduled >= 1 && graceElapsed < 1 && graceSkipped < 1) {
      pass = false;
      firstFail = firstFail ?? "grace_elapsed_missing_before_suppress";
    }
  }

  return { pass, firstFail, graceScheduled, graceElapsed, graceSkipped, suppressGapMs: activityTs != null && suppressTs != null ? suppressTs - activityTs : null };
}

async function waitPostDoneAndTapBannerAccept(serial, callId, media, maxMs = 30_000) {
  const deadline = Date.now() + maxMs;
  let graceAt = 0;
  while (Date.now() < deadline) {
    const logs = readLogcat(serial);
    if (countMarker(logs, "activity_notification_accept", callId) >= 1) {
      return { ok: true, method: "activity_notification_accept_seen" };
    }
    if (countMarker(logs, "state_connected", callId) >= 1) {
      return { ok: true, method: "state_connected_seen" };
    }
    if (countMarker(logs, "incoming_notification_suppress_grace_scheduled", callId) >= 1 && graceAt === 0) {
      graceAt = Date.now();
    }
    const inGrace =
      graceAt > 0 &&
      Date.now() - graceAt < 1_200 &&
      countMarker(logs, "incoming_notification_suppress_grace_elapsed", callId) === 0;
    if (countMarker(logs, "incoming_fcm_received", callId) >= 1 && (inGrace || countMarker(logs, "incoming_activity_shown", callId) === 0)) {
      const tap = await tapNotificationAccept(serial, { expandShade: true, maxCenterY: 1400 });
      if (tap.ok) return tap;
    }
    await sleep(inGrace ? 80 : 120);
  }
  return { ok: false, reason: "banner_accept_timeout" };
}

async function apiDial(media) {
  const auth = await buildAuth("aaaa", USER_A);
  const res = await fetch(`${WEB}/api/community-messenger/rooms/${ROOM_ID}/calls`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: auth.cookie },
    body: JSON.stringify({ callKind: media, dialIntent: "fresh" }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.status === 200 && Boolean(json?.callId), callId: json?.callId ?? "", status: res.status };
}

async function waitMarker(serial, callId, marker, maxMs = 90_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (countMarker(readLogcat(serial), marker, callId) >= 1) return true;
    await sleep(500);
  }
  return false;
}

async function waitConnected(serial, callId, maxMs = 120_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const logs = readLogcat(serial);
    if (countMarker(logs, "state_connected", callId) >= 1) return true;
    await sleep(500);
  }
  return false;
}

function evaluatePath(path, logs, callId) {
  const counts = {
    incoming_activity_shown: countMarker(logs, "incoming_activity_shown", callId),
    activity_notification_accept: countMarker(logs, "activity_notification_accept", callId),
    accept_tapped: countMarker(logs, "accept_tapped", callId),
    state_connected: countMarker(logs, "state_connected", callId),
  };
  const order = orderedMarkers(logs, callId, [
    "incoming_activity_shown",
    "activity_notification_accept",
    "accept_tapped",
    "state_connected",
  ]);

  let pass = counts.state_connected >= 1;
  let firstFail = pass ? null : "state_connected_missing";

  if (path === "banner") {
    if (counts.activity_notification_accept < 1) {
      pass = false;
      firstFail = firstFail ?? "activity_notification_accept_missing";
    }
    if (counts.incoming_activity_shown < 1) {
      pass = false;
      firstFail = firstFail ?? "incoming_activity_shown_missing";
    }
    const ordered =
      order.find((o) => o.marker === "incoming_activity_shown")?.idx ?? -1;
    const notifAccept =
      order.find((o) => o.marker === "activity_notification_accept")?.idx ?? -1;
    const connected = order.find((o) => o.marker === "state_connected")?.idx ?? -1;
    if (ordered >= 0 && notifAccept >= 0 && connected >= 0 && !(ordered <= notifAccept && notifAccept <= connected)) {
      pass = false;
      firstFail = firstFail ?? "banner_log_order_invalid";
    }
  } else {
    if (counts.activity_notification_accept > 0) {
      pass = false;
      firstFail = firstFail ?? "activity_notification_accept_unexpected";
    }
    if (counts.accept_tapped < 1) {
      pass = false;
      firstFail = firstFail ?? "accept_tapped_missing";
    }
    if (counts.incoming_activity_shown < 1) {
      pass = false;
      firstFail = firstFail ?? "incoming_activity_shown_missing";
    }
  }

  return { pass, firstFail, counts, order };
}

function mergeEval(path, logs, callId, baseEval) {
  const grace = evaluateGraceAndDuplicateUi(logs, callId, path);
  if (!grace.pass) {
    baseEval.pass = false;
    baseEval.firstFail = baseEval.firstFail ?? grace.firstFail;
  }
  return { ...baseEval, grace };
}

async function runScenario(scenario) {
  console.log(`\n[routing-qa] === ${scenario.id} ===`);
  await endAllCalls();
  await sleep(1500);
  adbObj(SERIAL_A, "shell", "am", "force-stop", PKG);
  adbObj(SERIAL_B, "shell", "am", "force-stop", PKG);
  await sleep(1200);
  await ensureLoginBoth();
  await prepCalleePushReady();

  if (scenario.path === "foreground_button") await prepForeground(SERIAL_B);
  else if (scenario.path === "fsi_button") await prepBackground(SERIAL_B);
  else await prepBackground(SERIAL_B);

  launchApkMainActivity(adbObj, SERIAL_A, ACT);
  await sleep(1500);

  adb(SERIAL_A, "logcat", "-c");
  adb(SERIAL_B, "logcat", "-c");

  const dial = await apiDial(scenario.media);
  if (!dial.ok) {
    return scenarioFail(scenario, { firstFail: "api_dial", dial });
  }
  const callId = dial.callId;
  console.log(`[routing-qa] dial callId=${callId}`);

  let acceptAction = { ok: false, skipped: false };

  if (scenario.path === "banner") {
    acceptAction = await waitPostDoneAndTapBannerAccept(SERIAL_B, callId, scenario.media);
    if (!acceptAction.ok) {
      const fcm = countMarker(readLogcat(SERIAL_B), "incoming_fcm_received", callId) >= 1;
      if (!fcm) {
        return scenarioFail(scenario, { callId, firstFail: "incoming_fcm_missing", dial, acceptAction });
      }
    }
  } else if (scenario.path === "fsi_button") {
    const shown = await waitMarker(SERIAL_B, callId, "incoming_activity_shown", 90_000);
    if (!shown) {
      return scenarioFail(scenario, { callId, firstFail: "incoming_activity_shown_timeout", dial });
    }
    await sleep(1500);
    acceptAction = tapActivityAccept(SERIAL_B, scenario.media);
  } else {
    const shown = await waitMarker(SERIAL_B, callId, "incoming_activity_shown", 90_000);
    if (!shown) {
      return scenarioFail(scenario, { callId, firstFail: "incoming_activity_shown_timeout", dial });
    }
    await sleep(1500);
    acceptAction = tapActivityAccept(SERIAL_B, scenario.media);
  }

  await sleep(1000);
  const connected = await waitConnected(SERIAL_B, callId);
  await sleep(1500);

  const logsB = readLogcat(SERIAL_B);
  const logsA = readLogcat(SERIAL_A);
  const evalResult = mergeEval(scenario.path, logsB, callId, evaluatePath(scenario.path, logsB, callId));
  if (!connected) {
    evalResult.pass = false;
    evalResult.firstFail = evalResult.firstFail ?? "state_connected_timeout";
  }
  if (!acceptAction.ok && scenario.path !== "banner") {
    evalResult.pass = false;
    evalResult.firstFail = evalResult.firstFail ?? "accept_tap_failed";
  }
  if (scenario.path === "banner" && !acceptAction.ok) {
    evalResult.pass = false;
    evalResult.firstFail = evalResult.firstFail ?? "notification_accept_tap_failed";
  }

  const callLines = logsB.split("\n").filter((l) => lineHasCallId(l, callId));
  fs.writeFileSync(path.join(OUT, `logcat-b-${scenario.id}-${callId}.txt`), logsB);
  fs.writeFileSync(path.join(OUT, `logcat-call-lines-${scenario.id}-${callId}.txt`), callLines.join("\n"));

  return {
    ...scenarioMeta(scenario),
    callId,
    dial,
    acceptAction,
    connected,
    ...evalResult,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  loadEnvLocal();
  console.log(`[routing-qa] A=${SERIAL_A} B=${SERIAL_B}`);

  const runtimeDiff = spawnSync("git", ["diff", "--name-only", "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallRuntime.java", "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallRuntime.java"], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout.trim();
  if (runtimeDiff) {
    console.error("[routing-qa] FAIL runtime files modified:", runtimeDiff);
    process.exit(2);
  }

  const scenarioList = resolveScenarioList();
  const gateMode = (process.env.ROUTING_QA_GATE ?? "full").trim().toLowerCase();
  console.log(`[routing-qa] gateMode=${gateMode} scenarios=${scenarioList.map((s) => s.id).join(",")}`);

  const results = [];
  for (const scenario of scenarioList) {
    const result = await runScenario(scenario);
    results.push(result);
    const tierTag = scenario.tier === "p0" ? "P0" : "REF";
    console.log(
      `[routing-qa] [${tierTag}] ${scenario.id} => ${result.pass ? "PASS" : "FAIL"} ${result.firstFail ?? ""}`,
    );
    if (!result.pass && scenario.tier === "p0") break;
    await endAllCalls();
    await sleep(2000);
  }

  const p0Results = results.filter((r) => r.tier === "p0");
  const referenceResults = results.filter((r) => r.tier === "reference");
  const expectedP0Count = SCENARIOS.filter((s) => s.tier === "p0").length;
  const p0AllPass =
    p0Results.length > 0 &&
    p0Results.every((r) => r.pass) &&
    (gateMode !== "p0" || p0Results.length === expectedP0Count);
  const referenceAllPass = referenceResults.length > 0 && referenceResults.every((r) => r.pass);

  const report = {
    at: new Date().toISOString(),
    gate: "release2_final_native_incoming_accept",
    qaStandard: "telegram_aligned_activity_accept",
    serialA: SERIAL_A,
    serialB: SERIAL_B,
    runtimeDiffZero: true,
    gateMode,
    p0AllPass,
    gatePass: p0AllPass,
    referenceAllPass: referenceResults.length ? referenceAllPass : null,
    allScenariosPass: results.every((r) => r.pass),
    p0Results,
    referenceResults,
    results,
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    `[routing-qa] gatePass=${report.gatePass} p0=${p0Results.filter((r) => r.pass).length}/${p0Results.length} reference=${referenceResults.filter((r) => r.pass).length}/${referenceResults.length}`,
  );
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.gatePass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
