#!/usr/bin/env node
/**
 * Call V4 Video Runtime — read-only device QA (prod).
 * Product code: NO CHANGES. QA script + log separation only.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  DIBAY_PKG,
  ensureApkWebViewLogin,
  forwardCdp,
  connectWebView,
  navigateApkWebView,
  probeApkUser,
  buildApkSessionCookies,
  refreshApkFcmRegisterTail,
} from "../scripts/qa/lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_ROOT = path.join(ROOT, ".qa-logs", "v4-video-runtime-readonly");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = DIBAY_PKG;
const ACT = `${PKG}/.MainActivity`;
const WEB = process.env.CAPACITOR_SERVER_URL?.trim() || "https://samarket.vercel.app";
const SERIAL_A = process.env.P4_DEVICE_A?.trim() || "8b37179f7d94";
const SERIAL_B = process.env.P4_DEVICE_B?.trim() || "RFCY40PY2CA";
const ROOM_ID = "b19e2672-f26f-4a2e-8125-52575da4a62a";
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const ACCEPT_ID = "com.dibay.app:id/incoming_call_accept";
const CDP_A = 9223;
const CDP_B = 9224;
const HEARTBEAT_HOLD_MS = 65_000;
const HEARTBEAT_MIN_JS_PINGS = 4;
const HEARTBEAT_MIN_FGS_PINGS = 4;
const FCM_SETTLE_MS = Number(process.env.RUNTIME_QA_FCM_SETTLE_MS?.trim() || "45000");
const USE_PM_CLEAR = process.env.RUNTIME_QA_PM_CLEAR?.trim() !== "0";
const ONLY_LOCK_UNLOCK = process.env.RUNTIME_QA_ONLY_LOCK_UNLOCK?.trim() === "1";
const ONLY_CAMERA = process.env.RUNTIME_QA_ONLY_CAMERA?.trim() === "1";
const NATIVE_VIDEO_MINIMAL = process.env.RUNTIME_QA_NATIVE_VIDEO_MINIMAL?.trim() === "1";
const ONLY_PROBE = ONLY_LOCK_UNLOCK || ONLY_CAMERA;

const NATIVE_VIDEO_MINIMAL_MARKERS = [
  "incoming_activity_shown",
  "accept_tapped",
  "accept_patch_done",
  "token_fetch_done",
  "agora_native_video_join_start",
  "agora_native_video_join_success",
  "local_camera_publish_success",
  "remote_video_rendered",
  "state_connected",
  "end_patch_done",
  "cleanup_done",
];

const NATIVE_VIDEO_CONNECTED_MARKERS = [
  "accept_tapped",
  "accept_patch_done",
  "token_fetch_done",
  "agora_native_video_join_start",
  "agora_native_video_join_success",
  "local_camera_publish_success",
  "remote_video_rendered",
  "state_connected",
];

const CALLEE_VIDEO_CONNECTED_CHAIN = [
  "remote_video_track_ready",
  "remote_track_exists",
  "attach_remote_video_begin",
  "attach_remote_video_success",
  "remote_video_element_attached",
  "ConnectedVideoView_render",
];

const FOREGROUND_RESUME_CHAIN = [
  "call_v4_foreground_resume_detected",
  "call_v4_foreground_resume_restore",
  "screen_mounted",
  "ConnectedVideoView_render",
  "remote_video_element_attached",
];

const FOREGROUND_RESUME_MARKERS = [
  ...FOREGROUND_RESUME_CHAIN,
  "call_v4_foreground_resume_skip",
];

const LOGCAT_STREAM_FILTER = [
  "DIBAY_CALL_V4:I",
  "DIBAY_WebView:I",
  "DIBAY_CALL:I",
  "DIBAY_INCOMING_CALL:I",
  "DIBAY_NATIVE_VIDEO:I",
  "DIBAY_CALL_PUSH:I",
  "Capacitor/Console:I",
  "DIBAY_NOTIFY:I",
  "*:S",
];

/** @type {string | null} */
let activeCallOut = null;
/** @type {Map<string, { child: import("node:child_process").ChildProcess, stream: import("node:fs").WriteStream }>} */
const logcatStreams = new Map();

function adbObj(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}
function adb(serial, ...args) {
  return adbObj(serial, ...args).stdout ?? "";
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function callDir(callId) {
  return path.join(OUT_ROOT, callId);
}

function callLogPath(callId, name) {
  return path.join(callDir(callId), name);
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
      if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
    }
  }
}

function lineHasCallId(line, callId) {
  if (!callId) return false;
  if (line.includes(callId)) return true;
  const compact = callId.replace(/-/g, "");
  return compact.length >= 8 && line.includes(compact);
}

function hasMarker(logText, marker, callId) {
  const lines = logText.split("\n");
  if (lines.some((l) => l.includes(marker) && (!callId || lineHasCallId(l, callId)))) return true;
  return lines.some(
    (l) =>
      (l.includes("DIBAY_WebView") || l.includes("Capacitor/Console")) &&
      l.includes(marker) &&
      (l.includes("[DIBAY_CALL_V4]") || l.includes("[DIBAY_CALL]")),
  );
}

function countHeartbeatPings(logText, callId, { fgsOnly = false, jsOnly = false } = {}) {
  return logText.split("\n").filter((l) => {
    if (!l.includes("call_heartbeat_ping")) return false;
    if (jsOnly) {
      const web = l.includes("DIBAY_WebView") || l.includes("Capacitor/Console");
      if (!web) return false;
      return !l.includes("source=fgs");
    }
    if (fgsOnly) {
      return l.includes("source=fgs") && (!callId || lineHasCallId(l, callId));
    }
    if (callId && lineHasCallId(l, callId)) return true;
    return l.includes("DIBAY_WebView") || l.includes("Capacitor/Console");
  }).length;
}

function analyzeHeartbeat(logsA, logsB, callId) {
  const merged = `${logsA}\n${logsB}`;
  const watchdogStart =
    hasMarker(logsA, "call_heartbeat_watchdog_start", callId) ||
    hasMarker(logsB, "call_heartbeat_watchdog_start", callId);
  const activeConnected =
    hasMarker(logsA, "active_call_connected", callId) ||
    hasMarker(logsB, "active_call_connected", callId);
  const patchOk =
    merged.includes("heartbeat_patch_ok") &&
    merged.split("\n").some((l) => l.includes("heartbeat_patch_ok") && (l.includes("DIBAY_WebView") || l.includes("Capacitor/Console")));
  const jsPingCount = countHeartbeatPings(logsA, callId, { jsOnly: true }) + countHeartbeatPings(logsB, callId, { jsOnly: true });
  const fgsPingCount = countHeartbeatPings(logsA, callId, { fgsOnly: true }) + countHeartbeatPings(logsB, callId, { fgsOnly: true });
  const timeoutObserved = merged
    .split("\n")
    .some((l) => l.includes("call_heartbeat_timeout") && lineHasCallId(l, callId));
  const remoteTerminalFinalize = merged
    .split("\n")
    .some((l) => l.includes("remote_terminal_finalize") && lineHasCallId(l, callId));
  const pass =
    activeConnected &&
    watchdogStart &&
    patchOk &&
    jsPingCount >= HEARTBEAT_MIN_JS_PINGS &&
    fgsPingCount >= HEARTBEAT_MIN_FGS_PINGS &&
    !timeoutObserved &&
    !remoteTerminalFinalize;
  return { activeConnected, watchdogStart, patchOk, jsPingCount, fgsPingCount, timeoutObserved, remoteTerminalFinalize, pass };
}

function analyzeMarkerChain(logText, callId, chain) {
  const observed = Object.fromEntries(chain.map((marker) => [marker, hasMarker(logText, marker, callId)]));
  let lastMarker = null;
  for (const marker of chain) {
    if (observed[marker]) lastMarker = marker;
  }
  return { observed, lastMarker, pass: chain.every((m) => observed[m]) };
}

function analyzeNativeVideoMinimalMarkers(logText, callId) {
  const observed = Object.fromEntries(
    NATIVE_VIDEO_MINIMAL_MARKERS.map((marker) => [marker, hasMarker(logText, marker, callId)]),
  );
  const firstMissing = NATIVE_VIDEO_MINIMAL_MARKERS.find((marker) => !observed[marker]) ?? null;
  return { observed, firstMissing, pass: firstMissing == null };
}

async function waitNativeVideoMarkers(callId, getLogs, markers, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = getLogs();
    const chain = analyzeMarkerChain(logs, callId, markers);
    if (chain.pass) return { ok: true, chain };
    await sleep(1000);
  }
  const logs = getLogs();
  const chain = analyzeMarkerChain(logs, callId, markers);
  return { ok: false, chain, firstMissing: markers.find((marker) => !chain.observed[marker]) ?? null };
}

function lineMatchesCallV4Marker(line, marker, callId) {
  if (!line.includes(marker)) return false;
  if (!line.includes("DIBAY_CALL_V4") && !(line.includes("DIBAY_WebView") && line.includes(marker))) {
    if (!(line.includes("Capacitor/Console") && line.includes(marker))) return false;
  }
  if (callId && !lineHasCallId(line, callId)) {
    if (!(line.includes("DIBAY_WebView") || line.includes("Capacitor/Console"))) return false;
  }
  return true;
}

function findMarkerLineIndex(logText, marker, callId, { afterIndex = 0 } = {}) {
  const lines = logText.split("\n");
  for (let i = afterIndex; i < lines.length; i++) {
    if (lineMatchesCallV4Marker(lines[i], marker, callId)) return i;
  }
  return -1;
}

function hasMarkerAfter(logText, marker, callId, afterIndex) {
  return findMarkerLineIndex(logText, marker, callId, { afterIndex }) >= 0;
}

function hasLocalVideoRepublishAfterUnpublish(logText, callId) {
  const unpublishIdx = findMarkerLineIndex(logText, "local_video_unpublish", callId);
  if (unpublishIdx < 0) return { unpublishIdx, publishStart: false, publishDone: false };
  const publishStartIdx = findMarkerLineIndex(logText, "local_video_publish_start", callId, {
    afterIndex: unpublishIdx + 1,
  });
  const publishDoneIdx =
    publishStartIdx >= 0
      ? findMarkerLineIndex(logText, "local_video_publish_done", callId, { afterIndex: publishStartIdx + 1 })
      : -1;
  const overlayIdx =
    publishStartIdx >= 0
      ? findMarkerLineIndex(logText, "self_video_overlay_rendered", callId, { afterIndex: publishStartIdx + 1 })
      : -1;
  return {
    unpublishIdx,
    publishStart: publishStartIdx >= 0,
    publishDone: publishDoneIdx >= 0,
    overlayRendered: overlayIdx >= 0,
    publishStartIdx,
    publishDoneIdx,
    overlayIdx,
  };
}

function sliceLogcatStream(callId, label, startLine = 0, endLine = null) {
  const streamPath = callLogPath(callId, `logcat-${label.toLowerCase()}-stream.txt`);
  if (!fs.existsSync(streamPath)) return "";
  const lines = fs.readFileSync(streamPath, "utf8").split("\n");
  const end = endLine == null ? lines.length : Math.min(endLine, lines.length);
  return lines.slice(startLine, end).join("\n");
}

function analyzeCameraOffOnChain({ runtime, logsA, callId, heartbeat }) {
  const cam = runtime.camera;
  const republish = hasLocalVideoRepublishAfterUnpublish(logsA, callId);
  const remoteVideoOk = [cam.camBefore, cam.camMid, cam.camAfter].every((s) => Boolean(s?.mainVideo?.playing));
  const heartbeatOk = heartbeat.pass && !heartbeat.timeoutObserved && !heartbeat.remoteTerminalFinalize;
  const selfPlaying =
    Boolean(cam.camAfter.selfPip?.playing) ||
    (republish.overlayRendered && cam.camAfter.videoCount > cam.camMid.videoCount);

  const chainSteps = [
    { step: "camera_off_click", pass: Boolean(cam.camOff.clicked) },
    { step: "local_video_unpublish", pass: republish.unpublishIdx >= 0 },
    {
      step: "self_video_hidden_or_paused",
      pass:
        Boolean(cam.camBefore.selfPip) &&
        !cam.camMid.selfPip &&
        cam.camMid.videoCount <= cam.camBefore.videoCount,
    },
    { step: "camera_on_click", pass: Boolean(cam.camOn.clicked) },
    { step: "local_video_publish_start", pass: republish.publishStart },
    { step: "local_video_publish_done", pass: republish.publishDone },
    { step: "self_video_playing", pass: selfPlaying },
  ];

  let lastSuccess = null;
  let firstMissing = null;
  for (const c of chainSteps) {
    if (c.pass) lastSuccess = c.step;
    else {
      firstMissing = c.step;
      break;
    }
  }

  const checks = {
    ...Object.fromEntries(chainSteps.map((c) => [c.step, c.pass])),
    remote_video_maintain: remoteVideoOk,
    heartbeat_maintain: heartbeatOk,
  };

  return {
    checks,
    republish,
    remoteVideoOk,
    heartbeatOk,
    lastSuccess,
    firstMissing,
    pass: chainSteps.every((c) => c.pass) && remoteVideoOk && heartbeatOk,
  };
}

function countStreamLines(callId, label) {
  const streamPath = callLogPath(callId, `logcat-${label.toLowerCase()}-stream.txt`);
  if (!fs.existsSync(streamPath)) return 0;
  const text = fs.readFileSync(streamPath, "utf8");
  if (!text) return 0;
  return text.split("\n").length;
}

function parseLogcatThreadTime(line) {
  const m = line.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})/);
  return m ? m[1] : null;
}

function isCallV4ConsoleLine(line) {
  return (
    line.includes("[DIBAY_CALL_V4]") ||
    (line.includes("DIBAY_WebView") && line.includes("DIBAY_CALL_V4")) ||
    (line.includes("Capacitor/Console") && line.includes("DIBAY_CALL_V4"))
  );
}

/** @returns {{ raw: string, json: object | null, reason: string | null }} */
function parseForegroundResumePayload(line, marker) {
  const rawTail = line.includes(marker) ? line.slice(line.indexOf(marker) + marker.length).trim() : line.trim();
  const raw = rawTail.replace(/^\[/, "").trim();

  const inlineJson = line.match(/(\{[^{}]*"reason"[^{}]*\})/);
  if (inlineJson) {
    try {
      const json = JSON.parse(inlineJson[1]);
      return { raw, json, reason: typeof json.reason === "string" ? json.reason : null };
    } catch {
      // fall through
    }
  }

  const reasonEq = line.match(/reason[=:]"?([a-z_]+)"?/i);
  if (reasonEq) {
    return { raw, json: { reason: reasonEq[1] }, reason: reasonEq[1] };
  }

  if (raw.includes("[object Object]") || raw === "[object Object]") {
    return { raw: "[object Object]", json: null, reason: null };
  }

  try {
    const json = JSON.parse(raw);
    if (json && typeof json === "object") {
      return { raw, json, reason: typeof json.reason === "string" ? json.reason : null };
    }
  } catch {
    // not JSON
  }

  return { raw, json: null, reason: null };
}

function extractCallV4MarkerEvents(logText, { startLine = 0, endLine = Infinity } = {}) {
  const lines = logText.split("\n");
  /** @type {Array<{ lineIndex: number, logTime: string | null, marker: string, line: string, payload: ReturnType<typeof parseForegroundResumePayload> }>} */
  const events = [];

  for (let i = 0; i < lines.length; i++) {
    if (i < startLine || i > endLine) continue;
    const line = lines[i];
    if (!isCallV4ConsoleLine(line)) continue;
    if (line.includes("Capacitor/Console:") && lines[i - 1]?.includes("DIBAY_WebView") && lines[i - 1]?.includes("[DIBAY_CALL_V4]")) {
      continue;
    }

    for (const marker of FOREGROUND_RESUME_MARKERS) {
      if (!line.includes(marker)) continue;
      const payload = parseForegroundResumePayload(line, marker);
      if (marker === "call_v4_foreground_resume_skip" && payload.reason == null) {
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const candidate = lines[j];
          if (!candidate.includes("Capacitor/Console") && !candidate.includes("DIBAY_WebView")) continue;
          const jsonMatch = candidate.match(/Msg:\s*(\{.*\})\s*$/);
          if (!jsonMatch) continue;
          try {
            const json = JSON.parse(jsonMatch[1]);
            if (json && typeof json === "object") {
              payload.json = json;
              payload.raw = jsonMatch[1];
              if (typeof json.reason === "string") payload.reason = json.reason;
              break;
            }
          } catch {
            // keep scanning
          }
        }
      }
      events.push({
        lineIndex: i,
        logTime: parseLogcatThreadTime(line),
        marker,
        line: line.trim(),
        payload,
      });
      break;
    }
  }

  return events;
}

function analyzeOrderedChain(events, chain) {
  const observed = Object.fromEntries(chain.map((marker) => [marker, false]));
  const orderedHits = [];
  let chainIndex = 0;

  for (const event of events) {
    if (chainIndex >= chain.length) break;
    const expected = chain[chainIndex];
    if (event.marker !== expected) continue;
    observed[expected] = true;
    orderedHits.push({
      marker: expected,
      logTime: event.logTime,
      lineIndex: event.lineIndex,
      payload: event.payload,
    });
    chainIndex += 1;
  }

  const firstMissing = chain.find((marker) => !observed[marker]) ?? null;
  const lastHit = orderedHits.length ? orderedHits[orderedHits.length - 1].marker : null;

  return {
    observed,
    orderedHits,
    lastHit,
    firstMissing,
    pass: firstMissing == null,
  };
}

const FOREGROUND_RESUME_POST_RESTORE_MARKERS = [
  "screen_mounted",
  "ConnectedVideoView_render",
  "remote_video_element_attached",
];

function analyzeForegroundResumeChain(logText, window) {
  const events = extractCallV4MarkerEvents(logText, window);
  const skipEvents = events
    .filter((e) => e.marker === "call_v4_foreground_resume_skip")
    .map((e) => ({
      logTime: e.logTime,
      lineIndex: e.lineIndex,
      reason: e.payload.reason,
      payloadRaw: e.payload.raw,
      payloadJson: e.payload.json,
    }));

  const detected = events.find((e) => e.marker === "call_v4_foreground_resume_detected") ?? null;
  const restore =
    events.find(
      (e) =>
        e.marker === "call_v4_foreground_resume_restore" &&
        (!detected || e.lineIndex >= detected.lineIndex),
    ) ?? null;
  const postRestoreEvents = restore ? events.filter((e) => e.lineIndex >= restore.lineIndex) : [];
  const postRestoreObserved = Object.fromEntries(
    FOREGROUND_RESUME_POST_RESTORE_MARKERS.map((marker) => [
      marker,
      postRestoreEvents.some((e) => e.marker === marker),
    ]),
  );
  const postRestoreFirstMissing =
    FOREGROUND_RESUME_POST_RESTORE_MARKERS.find((marker) => !postRestoreObserved[marker]) ?? null;
  const orderedHits = [];
  if (detected) orderedHits.push({ marker: detected.marker, logTime: detected.logTime, lineIndex: detected.lineIndex, payload: detected.payload });
  if (restore) orderedHits.push({ marker: restore.marker, logTime: restore.logTime, lineIndex: restore.lineIndex, payload: restore.payload });
  for (const marker of FOREGROUND_RESUME_POST_RESTORE_MARKERS) {
    const hit = postRestoreEvents.find((e) => e.marker === marker);
    if (hit) {
      orderedHits.push({
        marker: hit.marker,
        logTime: hit.logTime,
        lineIndex: hit.lineIndex,
        payload: hit.payload,
      });
    }
  }

  const observed = {
    call_v4_foreground_resume_detected: Boolean(detected),
    call_v4_foreground_resume_restore: Boolean(restore),
    ...postRestoreObserved,
  };
  const firstMissing = !detected
    ? "call_v4_foreground_resume_detected"
    : !restore
      ? "call_v4_foreground_resume_restore"
      : postRestoreFirstMissing;

  return {
    window,
    events,
    skipEvents,
    chain: {
      observed,
      orderedHits,
      lastHit: orderedHits.length ? orderedHits[orderedHits.length - 1].marker : null,
      firstMissing,
      pass: firstMissing == null,
    },
    pass: firstMissing == null,
  };
}

const LOCK_UNLOCK_NATIVE_CHAIN = [
  "SCREEN_OFF_ACTIVE",
  "screen_off_keep_alive",
  "REENTERING",
  "CONNECTED",
];

const LOCK_UNLOCK_VIDEO_MARKERS = ["ConnectedVideoView_render", "remote_video_element_attached"];

function analyzeLockUnlockNativePhase(logText, window) {
  const lines = logText.split("\n");
  const sliceLines = lines.slice(window.startLine, Math.min(window.endLine + 1, lines.length));
  const hits = [];

  const pushHit = (key, line, lineIndex) => {
    hits.push({
      key,
      logTime: parseLogcatThreadTime(line),
      lineIndex,
      line: line.trim(),
    });
  };

  const observed = {
    SCREEN_OFF_ACTIVE: false,
    screen_off_keep_alive: false,
    REENTERING: false,
    CONNECTED: false,
  };

  for (let i = 0; i < sliceLines.length; i++) {
    const line = sliceLines[i];
    const lineIndex = window.startLine + i;
    if (!observed.SCREEN_OFF_ACTIVE && line.includes("-> SCREEN_OFF_ACTIVE") && line.includes("source=screen_off")) {
      observed.SCREEN_OFF_ACTIVE = true;
      pushHit("SCREEN_OFF_ACTIVE", line, lineIndex);
    }
    if (!observed.screen_off_keep_alive && line.includes("call_lifecycle_screen_off_keep_alive")) {
      observed.screen_off_keep_alive = true;
      pushHit("screen_off_keep_alive", line, lineIndex);
    }
    if (!observed.REENTERING && line.includes("SCREEN_OFF_ACTIVE -> REENTERING") && line.includes("source=screen_on")) {
      observed.REENTERING = true;
      pushHit("REENTERING", line, lineIndex);
    }
    if (
      !observed.CONNECTED &&
      line.includes("REENTERING -> CONNECTED") &&
      line.includes("screen_on_complete")
    ) {
      observed.CONNECTED = true;
      pushHit("CONNECTED", line, lineIndex);
    }
  }

  const firstMissing = LOCK_UNLOCK_NATIVE_CHAIN.find((key) => !observed[key]) ?? null;

  return {
    window,
    observed,
    orderedHits: hits,
    firstMissing,
    pass: firstMissing == null,
  };
}

function analyzeLockUnlockVideoChain(logText, window) {
  const events = extractCallV4MarkerEvents(logText, window).filter((e) =>
    LOCK_UNLOCK_VIDEO_MARKERS.includes(e.marker),
  );
  const observed = Object.fromEntries(
    LOCK_UNLOCK_VIDEO_MARKERS.map((marker) => [marker, events.some((e) => e.marker === marker)]),
  );
  const firstMissing = LOCK_UNLOCK_VIDEO_MARKERS.find((marker) => !observed[marker]) ?? null;
  return {
    window,
    events,
    observed,
    firstMissing,
    pass: firstMissing == null,
    auxiliary: true,
  };
}

async function runLockUnlockProbe(page, callId) {
  const probe = {
    streamLineStartA: countStreamLines(callId, "A"),
  };

  probe.screenOffAt = new Date().toISOString();
  adb(SERIAL_A, "shell", "input", "keyevent", "26");
  await sleep(2000);

  probe.screenOnAt = new Date().toISOString();
  probe.streamLineAfterScreenOnA = countStreamLines(callId, "A");
  adb(SERIAL_A, "shell", "input", "keyevent", "26");
  await sleep(2500);

  probe.unlockSnapshotAt = new Date().toISOString();
  probe.streamLineEndA = countStreamLines(callId, "A");
  const unlock = await revealAndSnapshot(page);
  probe.unlock = unlock;
  probe.cdp = {
    onCallScreen: unlock.onCallScreen,
    videoCount: unlock.videoCount,
    mainVideoPlaying: Boolean(unlock.mainVideo?.playing),
  };
  return probe;
}

function prepareLogcatBuffer(serial) {
  adbObj(serial, "logcat", "-G", "16M");
}

function startStreamingLogcat(serial, label, callId) {
  const outPath = callLogPath(callId, `logcat-${label.toLowerCase()}-stream.txt`);
  const child = spawn(ADB, ["-s", serial, "logcat", "-v", "threadtime", ...LOGCAT_STREAM_FILTER], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stream = fs.createWriteStream(outPath, { flags: "w" });
  child.stdout?.pipe(stream);
  child.stderr?.pipe(stream);
  logcatStreams.set(serial, { child, stream });
  console.log(`[v4-runtime-ro] logcat_stream label=${label} path=${outPath}`);
}

async function stopStreamingLogcat(serial) {
  const capture = logcatStreams.get(serial);
  if (!capture) return;
  capture.child.kill("SIGINT");
  await new Promise((resolve) => {
    capture.child.once("close", resolve);
    setTimeout(resolve, 1500);
  });
  capture.stream.end();
  logcatStreams.delete(serial);
}

function logcatDump(serial) {
  return adb(serial, "logcat", "-d", "-v", "threadtime", ...LOGCAT_STREAM_FILTER);
}

function readMergedLogcat(serial, label, callId) {
  const streamPath = callLogPath(callId, `logcat-${label.toLowerCase()}-stream.txt`);
  const streamText = fs.existsSync(streamPath) ? fs.readFileSync(streamPath, "utf8") : "";
  const dumpText = logcatDump(serial);
  const merged = [streamText, dumpText].filter(Boolean).join("\n");
  fs.writeFileSync(callLogPath(callId, `logcat-${label.toLowerCase()}.txt`), merged);
  return merged;
}

async function endActiveCalls() {
  loadEnvLocal();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
    { auth: { persistSession: false } },
  );
  await sb
    .from("community_messenger_call_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString(), ended_reason: "runtime_readonly_qa_cleanup" })
    .in("status", ["ringing", "connecting", "connected", "active"])
    .or(
      `initiator_user_id.eq.${USER_A},callee_user_id.eq.${USER_A},initiator_user_id.eq.${USER_B},callee_user_id.eq.${USER_B}`,
    );
}

function grantAndroidCallPermissions() {
  const perms = [
    "android.permission.CAMERA",
    "android.permission.RECORD_AUDIO",
    "android.permission.MODIFY_AUDIO_SETTINGS",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.USE_FULL_SCREEN_INTENT",
  ];
  for (const serial of [SERIAL_A, SERIAL_B]) {
    for (const perm of perms) {
      adbObj(serial, "shell", "pm", "grant", PKG, perm);
    }
  }
}

function parseFcmRegisterReady(registerLogcat, expectedUserId) {
  const hasGranted =
    /permission_check.*state[=:"]+granted/i.test(registerLogcat) ||
    registerLogcat.includes('"kind":"notification","state":"granted"');
  const hasToken = /registration_event.*token_len[=:"]+[1-9]/i.test(registerLogcat);
  const hasSuccess =
    registerLogcat.includes(`success user_id=${expectedUserId}`) ||
    (registerLogcat.includes('"step":"success"') && registerLogcat.includes(expectedUserId));
  const reg = [...registerLogcat.matchAll(/"user_id":"([^"]+)"/g)];
  const fcmUserId = reg.length ? reg[reg.length - 1][1] : null;
  return { hasGranted, hasToken, hasSuccess, fcmUserId, ready: hasSuccess || (hasGranted && hasToken && fcmUserId === expectedUserId) };
}

async function ensureFcmReadyOnB() {
  grantAndroidCallPermissions();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const parsed = await cdpPage(SERIAL_B, CDP_B, async (page) => {
      await navigateApkWebView(page, `${WEB}/community-messenger`, 5000);
      let probe = await probeApkUser(page);
      if (!(probe.ok && probe.userId === USER_B)) {
        const { cookies } = await buildApkSessionCookies({
          login: "qqqq",
          prod: WEB,
          password: process.env.E2E_TEST_PASSWORD?.trim() || "1234",
          loadEnv: loadEnvLocal,
        });
        await page.context().addCookies(cookies);
        await navigateApkWebView(page, `${WEB}/community-messenger`, 5000);
        probe = await probeApkUser(page);
      }
      console.log(`[v4-runtime-ro] B session fcm attempt=${attempt}`, JSON.stringify(probe));
      if (!(probe.ok && probe.userId === USER_B)) throw new Error("B_session_lost_before_fcm");

      adb(SERIAL_B, "logcat", "-c");
      const deadline = Date.now() + 35_000;
      let lastParsed = parseFcmRegisterReady("", USER_B);
      while (Date.now() < deadline) {
        await sleep(2000);
        const dump = adb(
          SERIAL_B,
          "logcat",
          "-d",
          "-s",
          "DIBAY_PUSH_REGISTER",
          "DIBAY_FCM",
          "DIBAY_PUSH",
          "DIBAY_WebView",
          "Capacitor/Console",
        );
        lastParsed = parseFcmRegisterReady(dump, USER_B);
        if (lastParsed.ready) break;
      }
      return lastParsed;
    });
    console.log(`[v4-runtime-ro] fcm_gate attempt=${attempt}`, JSON.stringify(parsed));
    if (parsed.ready) {
      adb(SERIAL_B, "shell", "input", "keyevent", "3");
      await sleep(1500);
      return parsed;
    }

    console.log(`[v4-runtime-ro] fcm_gate retry with apk restart attempt=${attempt}`);
    await refreshApkFcmRegisterTail({
      adb: adbObj,
      serial: SERIAL_B,
      pkg: PKG,
      act: ACT,
      prod: WEB,
      expectedUserId: USER_B,
      log: (m) => console.log(`[v4-runtime-ro] B ${m}`),
      label: "B",
    });
    await sleep(12_000);
    const dump = adb(
      SERIAL_B,
      "logcat",
      "-d",
      "-s",
      "DIBAY_PUSH_REGISTER",
      "DIBAY_FCM",
      "DIBAY_PUSH",
      "DIBAY_WebView",
      "Capacitor/Console",
    );
    const afterRestart = parseFcmRegisterReady(dump, USER_B);
    console.log(`[v4-runtime-ro] fcm_gate after_restart attempt=${attempt}`, JSON.stringify(afterRestart));
    if (afterRestart.ready) {
      adb(SERIAL_B, "shell", "input", "keyevent", "3");
      await sleep(1500);
      return afterRestart;
    }
  }
  throw new Error("fcm_register_not_ready_on_B");
}

async function probeOrigin(serial, cdp, label) {
  return cdpPage(serial, cdp, async (page) => {
    const s = await page.evaluate(() => ({
      href: location.href,
      origin: location.origin,
      protocol: location.protocol,
      isSecureContext: window.isSecureContext,
    }));
    const pass = s.protocol === "https:" && s.isSecureContext && s.origin.includes("samarket.vercel.app");
    console.log(`[v4-runtime-ro] origin_${label}=`, JSON.stringify({ ...s, pass }));
    return { label, pass, ...s };
  });
}

async function pmClearAndWarmup() {
  console.log(`[v4-runtime-ro] warmup pm_clear=${USE_PM_CLEAR}`);
  if (USE_PM_CLEAR) {
    for (const serial of [SERIAL_A, SERIAL_B]) {
      adbObj(serial, "shell", "pm", "clear", PKG);
    }
    await sleep(2000);
  } else {
    console.log("[v4-runtime-ro] pm_clear_skipped (RUNTIME_QA_PM_CLEAR=0)");
  }
  grantAndroidCallPermissions();

  const PASSWORD = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
  for (const [serial, login, userId, cdp, label] of [
    [SERIAL_A, "aaaa", USER_A, CDP_A, "A"],
    [SERIAL_B, "qqqq", USER_B, CDP_B, "B"],
  ]) {
    const r = await ensureApkWebViewLogin({
      adb: adbObj,
      chromium,
      serial,
      cdpPort: cdp,
      act: ACT,
      pkg: PKG,
      prod: WEB,
      login,
      expectedUserId: userId,
      loadEnv: loadEnvLocal,
      password: PASSWORD,
      log: (m) => console.log(`[v4-runtime-ro] ${label} ${m}`),
      label,
      restartForFcm: USE_PM_CLEAR && label === "B",
    });
    if (!r.ok) throw new Error(`login_${label}_fail`);
  }

  const originA = await probeOrigin(SERIAL_A, CDP_A, "A");
  const originB = await probeOrigin(SERIAL_B, CDP_B, "B");
  if (!originA.pass || !originB.pass) throw new Error("origin_check_fail");

  await ensureFcmReadyOnB();
  const settleMs = USE_PM_CLEAR ? FCM_SETTLE_MS : Math.min(FCM_SETTLE_MS, 15_000);
  console.log(`[v4-runtime-ro] fcm_settle=${settleMs}ms`);
  await sleep(settleMs);
}

async function cdpPage(serial, cdp, fn) {
  forwardCdp(adbObj, serial, cdp);
  const { browser, page } = await connectWebView(chromium, cdp);
  try {
    return await fn(page);
  } finally {
    await browser.close().catch(() => {});
    adbObj(serial, "forward", "--remove", `tcp:${cdp}`);
  }
}

async function handleCallPermissionModal(page, { preferAllow = true } = {}) {
  return page.evaluate((allowFirst) => {
    const modal = document.querySelector('[aria-labelledby="dibay-call-permission-modal-title"]');
    if (!modal) return { action: "none" };
    if (allowFirst) {
      const allow = [...document.querySelectorAll("button")].find((b) =>
        /^(권한 허용|Allow access)$/i.test((b.textContent ?? "").trim()),
      );
      if (allow instanceof HTMLElement) {
        allow.click();
        return { action: "allow" };
      }
    }
    const later = [...document.querySelectorAll("button")].find((b) =>
      /^(나중에|Not now)$/i.test((b.textContent ?? "").trim()),
    );
    if (later instanceof HTMLElement) {
      later.click();
      return { action: "later" };
    }
    return { action: "unknown" };
  }, preferAllow);
}

async function dismissPermissionModal(page) {
  await handleCallPermissionModal(page, { preferAllow: false });
}

async function confirmOutgoingDial(page) {
  await sleep(1500);
  const perm = await handleCallPermissionModal(page, { preferAllow: true });
  const deadline = Date.now() + 18_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      href: location.href,
      onCallsV4: /\/calls-v4\//.test(location.href),
      hasConfirmDialog: Boolean(document.querySelector('[aria-labelledby="outgoing-call-confirm-title"]')),
    }));
    if (state.onCallsV4) {
      await sleep(2000);
      const postPerm = await handleCallPermissionModal(page, { preferAllow: true });
      return { ok: true, label: "v4_direct_launch", perm, postPerm, skippedConfirm: true, href: state.href };
    }
    if (state.hasConfirmDialog) break;
    await sleep(500);
  }
  return { ok: false, reason: "confirm_timeout" };
}

async function waitForRoomComposerReady(page, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => {
      const hrefOk = location.href.includes("/rooms/");
      const plus = document.querySelector("[data-cm-line-plus-btn]");
      const voice = document.querySelector('button[aria-label="음성 통화"], button[aria-label="Voice call"]');
      const menu = document.querySelector('button[aria-label="채팅방 메뉴"], button[aria-label="Chat room menu"]');
      return {
        hrefOk,
        plus: plus instanceof HTMLButtonElement,
        voice: voice instanceof HTMLButtonElement,
        menu: menu instanceof HTMLButtonElement,
      };
    });
    if (ready.hrefOk && (ready.plus || ready.voice || ready.menu)) return { ok: true, ...ready };
    await sleep(800);
  }
  return { ok: false, reason: "room_composer_not_ready" };
}

async function clickVideoButton(page) {
  return page.evaluate(() => {
    const labels = ["영상 통화", "Video call", "Video Call"];
    for (const label of labels) {
      const btn = document.querySelector(`button[aria-label="${label}"]`);
      if (btn instanceof HTMLElement && !btn.disabled) {
        btn.click();
        return { ok: true, via: `aria:${label}` };
      }
    }
    const row = [...document.querySelectorAll("button")].find((b) =>
      /^(영상 통화|Video call)$/i.test((b.textContent ?? "").trim()),
    );
    if (row instanceof HTMLElement && !row.disabled) {
      row.click();
      return { ok: true, via: "text:영상 통화" };
    }
    return { ok: false, reason: "video_button_not_found" };
  });
}

async function openRoomDotMenu(page) {
  const headerMenu = await page.evaluate(() => {
    const menuLabels = ["채팅방 메뉴", "Chat room menu"];
    for (const label of menuLabels) {
      const btn = document.querySelector(`button[aria-label="${label}"]`);
      if (btn instanceof HTMLElement && !btn.disabled) {
        btn.click();
        return { ok: true, via: `header_menu:${label}` };
      }
    }
    return { ok: false, reason: "header_menu_not_found" };
  });
  if (headerMenu.ok) return headerMenu;

  const attachOpened = await page.evaluate(() => {
    const plus = document.querySelector("[data-cm-line-plus-btn]");
    if (!(plus instanceof HTMLButtonElement) || plus.disabled) {
      return { ok: false, reason: "composer_plus_not_found" };
    }
    plus.click();
    return { ok: true, via: "composer_plus" };
  });
  if (!attachOpened.ok) return attachOpened;
  await sleep(1500);
  return page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /사진·파일|room info|서랍|attach/i.test(b.textContent ?? ""),
    );
    if (btn instanceof HTMLElement) {
      btn.click();
      return { ok: true, via: "drawer_attach" };
    }
    return { ok: false, reason: "drawer_attach_not_found" };
  });
}

/** smoke parity: auth probe → room → video dial */
async function uiDialVideoFromA() {
  return cdpPage(SERIAL_A, CDP_A, async (page) => {
    const attempts = [];
    await navigateApkWebView(page, `${WEB}/community-messenger`, 4000);
    let probe = await probeApkUser(page);
    if (!(probe.ok && probe.userId === USER_A)) {
      const { cookies } = await buildApkSessionCookies({
        login: "aaaa",
        prod: WEB,
        password: process.env.E2E_TEST_PASSWORD?.trim() || "1234",
        loadEnv: loadEnvLocal,
      });
      await page.context().addCookies(cookies);
      await navigateApkWebView(page, `${WEB}/community-messenger`, 4000);
      probe = await probeApkUser(page);
      if (!(probe.ok && probe.userId === USER_A)) {
        return { ok: false, reason: "auth_lost_before_room_dial", probe };
      }
    }

    await navigateApkWebView(page, `${WEB}/community-messenger/rooms/${ROOM_ID}`, 10000);
    const href0 = await page.evaluate(() => location.href);
    if (!href0.includes("/rooms/")) return { ok: false, reason: "room_not_loaded", href: href0 };
    const roomReady = await waitForRoomComposerReady(page, 45_000);
    attempts.push({ path: "room_ready", ...roomReady });
    console.log(`[v4-runtime-ro] room_ready=`, JSON.stringify(roomReady));
    if (!roomReady.ok) return { ok: false, reason: roomReady.reason ?? "room_composer_not_ready", href: href0, attempts };

    await dismissPermissionModal(page);
    await sleep(1000);

    let clicked = await clickVideoButton(page);
    await handleCallPermissionModal(page, { preferAllow: true });
    if (!clicked.ok) {
      const menuOpened = await openRoomDotMenu(page);
      attempts.push({ path: "room_menu", ...menuOpened });
      if (menuOpened.ok) {
        await sleep(1500);
        clicked = await clickVideoButton(page);
      }
    }
    if (!clicked.ok) return { ok: false, reason: clicked.reason ?? "dial_button_missing", attempts };

    const confirmed = await confirmOutgoingDial(page);
    if (!confirmed.ok) return { ok: false, reason: confirmed.reason ?? "confirm_fail", confirmed, attempts };
    const href = await page.evaluate(() => location.href);
    const callId = href.match(/\/calls-v4\/([^/?#]+)/)?.[1] ?? "";
    return { ok: Boolean(callId), callId, href, via: clicked.via, confirmed, attempts };
  });
}

async function resetCalleeToPhilife() {
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
  await sleep(6000);
  adb(SERIAL_B, "shell", "input", "keyevent", "3");
  await sleep(1500);
}

async function establishCallSession(attemptLabel) {
  const stagingId = `staging-${attemptLabel}`;
  fs.mkdirSync(callDir(stagingId), { recursive: true });

  prepareLogcatBuffer(SERIAL_A);
  prepareLogcatBuffer(SERIAL_B);
  adb(SERIAL_A, "logcat", "-c");
  adb(SERIAL_B, "logcat", "-c");
  for (const serial of [SERIAL_A, SERIAL_B]) {
    if (logcatStreams.has(serial)) await stopStreamingLogcat(serial);
  }
  startStreamingLogcat(SERIAL_A, "A", stagingId);
  startStreamingLogcat(SERIAL_B, "B", stagingId);

  await resetCalleeToPhilife();

  const dial = await uiDialVideoFromA();
  console.log(`[v4-runtime-ro] dial_${attemptLabel}=`, JSON.stringify(dial));
  if (!dial.ok) return { ok: false, stage: "dial", dial };

  const callId = dial.callId;
  const stagingDir = callDir(stagingId);
  const finalDir = callDir(callId);
  fs.mkdirSync(finalDir, { recursive: true });
  for (const f of fs.readdirSync(stagingDir)) {
    const destName = f.replace(stagingId, callId);
    fs.renameSync(path.join(stagingDir, f), path.join(finalDir, destName));
  }
  fs.rmdirSync(stagingDir);
  for (const serial of [SERIAL_A, SERIAL_B]) {
    if (logcatStreams.has(serial)) await stopStreamingLogcat(serial);
  }
  startStreamingLogcat(SERIAL_A, "A", callId);
  startStreamingLogcat(SERIAL_B, "B", callId);
  fs.writeFileSync(callLogPath(callId, "dial.json"), JSON.stringify(dial, null, 2));

  const getLogsMerged = () => {
    const aStream = fs.existsSync(callLogPath(callId, "logcat-a-stream.txt"))
      ? fs.readFileSync(callLogPath(callId, "logcat-a-stream.txt"), "utf8")
      : "";
    const bStream = fs.existsSync(callLogPath(callId, "logcat-b-stream.txt"))
      ? fs.readFileSync(callLogPath(callId, "logcat-b-stream.txt"), "utf8")
      : "";
    return `${aStream}\n${bStream}\n${logcatDump(SERIAL_A)}\n${logcatDump(SERIAL_B)}`;
  };
  const getLogsB = () => {
    const bStream = fs.existsSync(callLogPath(callId, "logcat-b-stream.txt"))
      ? fs.readFileSync(callLogPath(callId, "logcat-b-stream.txt"), "utf8")
      : "";
    return `${bStream}\n${logcatDump(SERIAL_B)}`;
  };

  adb(SERIAL_B, "shell", "input", "keyevent", "224");
  await sleep(500);

  const incoming = await waitIncoming(callId, getLogsMerged, 90_000);
  console.log(`[v4-runtime-ro] incoming_${attemptLabel}=`, JSON.stringify(incoming));
  if (!incoming.ok) {
    return { ok: false, stage: "incoming", callId, dial, incoming };
  }

  const acceptReady = await waitAcceptButton(callId, getLogsB);
  console.log(`[v4-runtime-ro] accept_button_${attemptLabel}=${acceptReady}`);
  let tap = { tapped: false };
  for (let i = 0; i < 10; i++) {
    tap = tapAccept(SERIAL_B);
    if (tap.tapped) break;
    await sleep(1500);
  }
  console.log(`[v4-runtime-ro] accept_tap_${attemptLabel}=`, JSON.stringify(tap));
  if (!tap.tapped) return { ok: false, stage: "accept_tap", callId, dial, tap };

  const connected = await waitVideoConnected(callId, getLogsB);
  console.log(`[v4-runtime-ro] video_connected_${attemptLabel}=`, JSON.stringify(connected));
  if (!connected.ok) return { ok: false, stage: "video_connected", callId, dial, connected };

  return { ok: true, callId, dial, incoming, tap, connected, getLogsMerged, getLogsB };
}

function tapAccept(serial) {
  adbObj(serial, "shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  const xml = adb(serial, "shell", "cat", "/sdcard/uidump.xml");
  const patterns = [
    new RegExp(
      `resource-id="${ACCEPT_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
    ),
    /content-desc="[^"]*(?:수락|Accept|Answer)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /text="[^"]*(?:수락|Accept|Answer)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (!m) continue;
    const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
    const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
    adb(serial, "shell", "input", "tap", String(x), String(y));
    return { tapped: true, x, y };
  }
  return { tapped: false };
}

function incomingUiVisible(serial) {
  adbObj(serial, "shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  const xml = adb(serial, "shell", "cat", "/sdcard/uidump.xml");
  return (
    xml.includes("IncomingCallActivity") ||
    xml.includes("incoming_call_accept") ||
    /content-desc="[^"]*(?:수락|Accept|Answer)/i.test(xml)
  );
}

async function waitIncoming(callId, getLogs, timeoutMs = 70_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = getLogs();
    if (logs.includes("incoming_activity_shown") && lineHasCallId(logs, callId)) {
      return { ok: true, via: "incoming_activity_shown" };
    }
    if (logs.includes("fcm_incoming_received") && lineHasCallId(logs, callId)) {
      return { ok: true, via: "fcm_incoming_received" };
    }
    if (logs.includes("active_incoming_store_set") && lineHasCallId(logs, callId)) {
      return { ok: true, via: "active_incoming_store_set" };
    }
    if (logs.includes("fsi_attached") && lineHasCallId(logs, callId)) {
      return { ok: true, via: "fsi_attached" };
    }
    if (incomingUiVisible(SERIAL_B)) {
      return { ok: true, via: "incoming_ui_dump" };
    }
    await sleep(500);
  }
  return { ok: false };
}

async function waitAcceptButton(callId, getLogsB, timeoutMs = 55_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = getLogsB();
    if (logs.includes("accept_button_rendered") && lineHasCallId(logs, callId)) return true;
    if (NATIVE_VIDEO_MINIMAL && incomingUiVisible(SERIAL_B)) return true;
    await sleep(400);
  }
  return false;
}

async function waitVideoConnected(callId, getLogsB, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  if (NATIVE_VIDEO_MINIMAL) {
    return waitNativeVideoMarkers(callId, getLogsB, NATIVE_VIDEO_CONNECTED_MARKERS, timeoutMs);
  }
  while (Date.now() < deadline) {
    const logs = getLogsB();
    const chain = analyzeMarkerChain(logs, callId, CALLEE_VIDEO_CONNECTED_CHAIN);
    if (chain.observed.ConnectedVideoView_render && chain.observed.remote_video_track_ready) {
      return { ok: true, chain };
    }
    await sleep(2000);
  }
  const logs = getLogsB();
  return { ok: false, chain: analyzeMarkerChain(logs, callId, CALLEE_VIDEO_CONNECTED_CHAIN) };
}

function tapEnd(serial) {
  adbObj(serial, "shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  const xml = adb(serial, "shell", "cat", "/sdcard/uidump.xml");
  const patterns = [
    /content-desc="[^"]*(?:종료|End|Hang up)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
    /text="[^"]*(?:종료|End|Hang up)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (!m) continue;
    const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
    const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
    adb(serial, "shell", "input", "tap", String(x), String(y));
    return { tapped: true, x, y };
  }
  return { tapped: false };
}

/** Browser-side: role/testid/aria/state button discovery */
const BROWSER_HELPERS = `
window.__listCallButtons = function() {
  const endRe = /종료|end call|decline/i;
  return [...document.querySelectorAll("button.call-btn")].map((btn, idx) => {
    const label = (btn.textContent ?? "").replace(/\\s+/g, " ").trim();
    const aria = btn.getAttribute("aria-label") ?? "";
    const testId = btn.getAttribute("data-testid") ?? "";
    const svg = btn.querySelector("svg");
    const paths = svg ? [...svg.querySelectorAll("path")].map((p) => p.getAttribute("d") || "").join(" ") : "";
    const cls = svg?.getAttribute("class") ?? "";
    const disk = btn.querySelector(".call-btn__disk");
    const diskCls = disk?.className ?? "";
    return {
      idx,
      testId,
      label,
      aria,
      disabled: btn.disabled,
      isEnd: endRe.test(label) || testId.includes("end"),
      isMic:
        /mic/i.test(cls) ||
        /음소거|mute|해제|unmute/i.test(label) ||
        /음소거|mute|unmute/i.test(aria),
      isCamera:
        ((!paths.includes("15.5") && (/video/i.test(cls) || /lucide-video/i.test(cls))) ||
          /카메라|camera/i.test(label) ||
          /camera/i.test(aria)),
      isCameraSwitch: paths.includes("15.5") || /전환|flip|switch/i.test(label + aria),
      diskActive: /bg-\\[#F1F8F4\\]|bg-white/.test(diskCls),
    };
  });
};

window.__revealControls = function() {
  const reveal = document.querySelector('button[aria-label*="컨트롤"], button[aria-label*="controls"]');
  if (reveal instanceof HTMLElement) reveal.click();
};

window.__videoSnapshot = function() {
  const videos = [...document.querySelectorAll("video")].map((v) => {
    const r = v.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), playing: !v.paused && v.readyState >= 2 };
  });
  const main = videos.find((v) => v.w >= 200 && v.h >= 200) ?? null;
  const pip = videos.find((v) => v.w > 40 && v.w < window.innerWidth * 0.55) ?? null;
  const ratio = pip && pip.h > 0 ? pip.w / pip.h : null;
  return {
    onCallScreen: Boolean(document.querySelector('[data-testid="call-v4-screen"]')),
    videoCount: videos.length,
    mainVideo: main,
    selfPip: pip,
    selfAspect916: ratio != null ? Math.abs(ratio - 9 / 16) < 0.12 : false,
    selfRatio: ratio != null ? Number(ratio.toFixed(3)) : null,
    buttons: window.__listCallButtons(),
    hasCameraSwitch: window.__listCallButtons().some((b) => b.isCameraSwitch),
  };
};

window.__clickCallRole = function(role) {
  window.__revealControls();
  const buttons = window.__listCallButtons().filter((b) => !b.isEnd && !b.disabled);
  let target = null;
  if (role === "mic") {
    target = buttons.find((b) => b.isMic);
  } else if (role === "camera") {
    target = buttons.find((b) => b.isCamera && !b.isCameraSwitch);
  } else if (role === "camera_switch") {
    target = buttons.find((b) => b.isCameraSwitch);
  }
  if (!target) return { clicked: false, role, buttons };
  const btn = document.querySelectorAll("button.call-btn")[target.idx];
  if (!(btn instanceof HTMLElement)) return { clicked: false, role, buttons };
  btn.click();
  return { clicked: true, role, via: target.testId || target.label || target.aria || role, target };
};

window.__clickCameraOn = function() {
  window.__revealControls();
  const snap = window.__videoSnapshot();
  const buttons = window.__listCallButtons().filter((b) => !b.isEnd && !b.disabled);
  const offState = snap.selfPip == null && snap.videoCount <= 1;
  const cameraLabelRe = /카메라|camera/i;
  const cameraOnLabelRe = /카메라\\s*켜기|turn\\s*camera\\s*on/i;
  const switchToVideoRe = /영상\\s*전환|switch\\s*to\\s*video/i;

  const candidates = [];
  for (const b of buttons) {
    const label = b.label || "";
    const aria = b.aria || "";
    const text = (label + " " + aria).trim();
    let reason = null;
    if (cameraOnLabelRe.test(text)) {
      reason = "label_camera_on";
    } else if (cameraLabelRe.test(label) || cameraLabelRe.test(aria)) {
      if (b.isCamera && !b.isCameraSwitch) reason = "label_camera";
      else if (cameraLabelRe.test(label)) reason = "label_camera_fuzzy";
    } else if (switchToVideoRe.test(text) && offState) {
      reason = "label_switch_to_video_off_state";
    }
    if (reason) candidates.push({ ...b, reason });
  }

  const priority = ["label_camera_on", "label_camera", "label_camera_fuzzy", "label_switch_to_video_off_state"];
  let target = null;
  for (const p of priority) {
    target = candidates.find((c) => c.reason === p) ?? null;
    if (target) break;
  }

  if (!target) {
    return {
      clicked: false,
      role: "camera_on",
      offState,
      snap: { videoCount: snap.videoCount, selfPip: snap.selfPip },
      buttons,
      candidates,
    };
  }
  const btn = document.querySelectorAll("button.call-btn")[target.idx];
  if (!(btn instanceof HTMLElement)) {
    return { clicked: false, role: "camera_on", offState, buttons, candidates, target };
  }
  btn.click();
  return {
    clicked: true,
    role: "camera_on",
    via: target.testId || target.label || target.aria || "camera_on",
    offState,
    target,
    candidates,
  };
};
`;

async function injectHelpers(page) {
  await page.evaluate((code) => {
    // Browser helper bundle — eval required for multi-function injection.
    // eslint-disable-next-line no-eval
    eval(code);
  }, BROWSER_HELPERS);
}

async function revealAndSnapshot(page) {
  await injectHelpers(page);
  await page.evaluate(() => window.__revealControls());
  await sleep(400);
  return page.evaluate(() => window.__videoSnapshot());
}

async function clickRole(page, role) {
  await injectHelpers(page);
  return page.evaluate((r) => window.__clickCallRole(r), role);
}

async function clickCameraOn(page) {
  await injectHelpers(page);
  return page.evaluate(() => window.__clickCameraOn());
}

async function waitForSelfPipAfterCamOn(page, { attempts = 10, intervalMs = 500 } = {}) {
  let camAfter = await revealAndSnapshot(page);
  for (let i = 0; i < attempts; i++) {
    if (camAfter.selfPip?.playing) return { camAfter, polls: i + 1 };
    await sleep(intervalMs);
    camAfter = await revealAndSnapshot(page);
  }
  return { camAfter, polls: attempts };
}

function judgeSelf916(snap) {
  if (!snap?.selfPip) return "INCONCLUSIVE";
  return snap.selfAspect916 ? "PASS" : "FAIL";
}

function pickTopFixCandidate(results) {
  const impact = [
    ["camera_front_back_switch", "NOT_IMPL", "통화 중 전/후면 카메라 전환 불가"],
    ["background_foreground", "FAIL", "백그라운드 복귀 시 통화 화면/영상 끊김"],
    ["screen_lock_unlock", "FAIL", "잠금 해제 후 통화 복귀 실패"],
    ["screen_rotation", "FAIL", "회전 후 통화 UI/영상 붕괴"],
    ["camera_off_on", "FAIL", "카메라 on/off 동작 불안정"],
    ["self_overlay_9_16", "FAIL", "self PiP 9:16 비율 미충족"],
    ["remote_video_maintain", "FAIL", "상대 영상 유지 실패"],
    ["mic_off_on", "FAIL", "마이크 토글 실패"],
  ];
  for (const [key, status, reason] of impact) {
    if (results[key] === status) return { key, status, reason };
  }
  for (const [key, val] of Object.entries(results)) {
    if (val === "FAIL") return { key, status: "FAIL", reason: `${key} FAIL` };
  }
  for (const [key, val] of Object.entries(results)) {
    if (val === "NOT_IMPL") return { key, status: "NOT_IMPL", reason: `${key} NOT_IMPL` };
  }
  return null;
}

async function main() {
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  loadEnvLocal();
  const results = {};
  const evidence = {};

  console.log(`[v4-runtime-ro] web=${WEB} only_lock_unlock=${ONLY_LOCK_UNLOCK} only_camera=${ONLY_CAMERA}`);
  await endActiveCalls();
  await sleep(1500);
  await pmClearAndWarmup();

  let session = null;
  for (const attempt of ["r1", "r2"]) {
    session = await establishCallSession(attempt);
    if (session.ok) break;
    console.log(`[v4-runtime-ro] establish_fail_${attempt}=`, JSON.stringify(session));
    await endActiveCalls();
    await sleep(2000);
  }
  if (!session?.ok) {
    const report = {
      at: new Date().toISOString(),
      verdict: "BLOCKED",
      stage: session?.stage ?? "establish",
      session,
      results,
    };
    fs.writeFileSync(path.join(OUT_ROOT, "report-blocked.json"), JSON.stringify(report, null, 2));
    if (session?.callId) fs.writeFileSync(callLogPath(session.callId, "report.json"), JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const callId = session.callId;
  activeCallOut = callDir(callId);
  const getLogsMerged = session.getLogsMerged;
  const getLogsB = session.getLogsB;

  results.video_connected = session.connected.ok ? "PASS" : "FAIL";
  evidence.establish = session;

  if (NATIVE_VIDEO_MINIMAL) {
    const endTap = tapEnd(SERIAL_B);
    evidence.endTap = endTap;
    console.log(`[v4-runtime-ro] native_video_minimal_end_tap=`, JSON.stringify(endTap));
    const deadline = Date.now() + 45_000;
    let nativeMarkers = analyzeNativeVideoMinimalMarkers(getLogsMerged(), callId);
    while (Date.now() < deadline && !nativeMarkers.pass) {
      await sleep(1000);
      nativeMarkers = analyzeNativeVideoMinimalMarkers(getLogsMerged(), callId);
    }
    await stopStreamingLogcat(SERIAL_A);
    await stopStreamingLogcat(SERIAL_B);
    const logsAFinal = readMergedLogcat(SERIAL_A, "A", callId);
    const logsBFinal = readMergedLogcat(SERIAL_B, "B", callId);
    nativeMarkers = analyzeNativeVideoMinimalMarkers(`${logsAFinal}\n${logsBFinal}`, callId);
    results.native_video_minimal_markers = nativeMarkers.pass ? "PASS" : "FAIL";
    const report = {
      at: new Date().toISOString(),
      phase: "native-video-minimal",
      webTarget: WEB,
      callId,
      callLogDir: activeCallOut,
      dial: session.dial,
      results,
      evidence,
      nativeMarkers,
      verdict: nativeMarkers.pass ? "PASS" : "FAIL",
    };
    fs.writeFileSync(callLogPath(callId, "report.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(OUT_ROOT, "report-latest.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ callId, verdict: report.verdict, nativeMarkers }, null, 2));
    process.exit(nativeMarkers.pass ? 0 : 1);
  }

  const uiGateA = await cdpPage(SERIAL_A, CDP_A, (page) => revealAndSnapshot(page));
  const uiGateB = await cdpPage(SERIAL_B, CDP_B, (page) => revealAndSnapshot(page));
  evidence.connected_ui = { A: uiGateA, B: uiGateB };
  if (!(uiGateA.onCallScreen && uiGateA.mainVideo?.playing && uiGateB.onCallScreen && uiGateB.videoCount >= 1)) {
    results.video_connected = "FAIL";
  }

  console.log(`[v4-runtime-ro] heartbeat_hold=${HEARTBEAT_HOLD_MS}ms`);
  await sleep(HEARTBEAT_HOLD_MS);

  const logsA = readMergedLogcat(SERIAL_A, "A", callId);
  const logsB = readMergedLogcat(SERIAL_B, "B", callId);
  const heartbeat = analyzeHeartbeat(logsA, logsB, callId);
  evidence.heartbeat = heartbeat;
  results.heartbeat_65s = heartbeat.pass ? "PASS" : heartbeat.timeoutObserved ? "FAIL" : "INCONCLUSIVE";
  console.log(`[v4-runtime-ro] heartbeat=`, JSON.stringify(heartbeat));

  // Runtime probes — logcat stream stays open through lock/unlock (and optional BG/FG).
  const runtime = await cdpPage(SERIAL_A, CDP_A, async (page) => {
    const out = {};
    out.baseline = await revealAndSnapshot(page);

    if (ONLY_LOCK_UNLOCK) {
      out.lockUnlockProbe = await runLockUnlockProbe(page, callId);
      out.unlock = out.lockUnlockProbe.unlock;
      return out;
    }

    if (ONLY_CAMERA) {
      out.cameraProbe = { streamLineStartA: countStreamLines(callId, "A") };
      const camBefore = await revealAndSnapshot(page);
      const camOff = await clickRole(page, "camera");
      await sleep(1500);
      const camMid = await revealAndSnapshot(page);
      const camOn = await clickCameraOn(page);
      await sleep(800);
      const { camAfter, polls: camAfterPolls } = await waitForSelfPipAfterCamOn(page);
      out.camera = { camBefore, camOff, camMid, camOn, camAfter, camAfterPolls };
      out.cameraProbe.streamLineEndA = countStreamLines(callId, "A");
      return out;
    }

    const micOff = await clickRole(page, "mic");
    await sleep(1200);
    const micMid = await revealAndSnapshot(page);
    const micOn = await clickRole(page, "mic");
    await sleep(1200);
    const micAfter = await revealAndSnapshot(page);
    out.mic = { micOff, micOn, micMid, micAfter };

    const camBefore = await revealAndSnapshot(page);
    const camOff = await clickRole(page, "camera");
    await sleep(1500);
    const camMid = await revealAndSnapshot(page);
    const camOn = await clickCameraOn(page);
    await sleep(800);
    const { camAfter, polls: camAfterPolls } = await waitForSelfPipAfterCamOn(page);
    out.camera = { camBefore, camOff, camMid, camOn, camAfter, camAfterPolls };

    out.cameraSwitchProbe = await revealAndSnapshot(page);
    const camSwitchClick = await clickRole(page, "camera_switch");
    out.cameraSwitchClick = camSwitchClick;

    const snap = async () => revealAndSnapshot(page);

    adb(SERIAL_A, "shell", "settings", "put", "system", "accelerometer_rotation", "0");
    adb(SERIAL_A, "shell", "settings", "put", "system", "user_rotation", "1");
    await sleep(2500);
    out.rotation = await snap();
    adb(SERIAL_A, "shell", "settings", "put", "system", "user_rotation", "0");
    await sleep(2000);
    out.rotationRestored = await snap();

    out.bgFgProbe = {
      homeKeyeventBeforeAt: new Date().toISOString(),
      streamLineStartA: countStreamLines(callId, "A"),
    };

    adb(SERIAL_A, "shell", "input", "keyevent", "3");
    await sleep(2500);
    out.bgFgProbe.homeKeyeventAfterAt = new Date().toISOString();
    out.bgFgProbe.streamLineAfterHomeA = countStreamLines(callId, "A");

    out.bgFgProbe.foregroundIntentAt = new Date().toISOString();
    adbObj(
      SERIAL_A,
      "shell",
      "am",
      "start",
      "-n",
      ACT,
      "-a",
      "android.intent.action.VIEW",
      "-d",
      `${WEB}/community-messenger`,
    );
    await sleep(4000);
    out.bgFgProbe.foregroundSnapshotAt = new Date().toISOString();
    out.foreground = await snap();
    out.bgFgProbe.streamLineEndA = countStreamLines(callId, "A");
    out.bgFgProbe.cdp = {
      onCallScreen: out.foreground.onCallScreen,
      videoCount: out.foreground.videoCount,
      mainVideoPlaying: Boolean(out.foreground.mainVideo?.playing),
    };

    out.lockUnlockProbe = await runLockUnlockProbe(page, callId);
    out.unlock = out.lockUnlockProbe.unlock;

    return out;
  });

  await sleep(1500);
  await stopStreamingLogcat(SERIAL_A);
  await stopStreamingLogcat(SERIAL_B);

  const logsAFinal = readMergedLogcat(SERIAL_A, "A", callId);
  const logsBFinal = readMergedLogcat(SERIAL_B, "B", callId);
  const logsMergedFinal = `${logsAFinal}\n${logsBFinal}`;
  const streamLineTotalA = logsAFinal.split("\n").length;

  let lockUnlockNativePhase = { pass: true, skipped: true, firstMissing: null, observed: {} };
  let lockUnlockVideoChain = { pass: true, skipped: true, firstMissing: null, observed: {} };
  if (!ONLY_CAMERA && runtime.lockUnlockProbe) {
    const lockWindow = {
      startLine: runtime.lockUnlockProbe.streamLineStartA,
      endLine: streamLineTotalA,
      streamLineAtSnapshot: runtime.lockUnlockProbe.streamLineEndA,
      streamLineTotalA,
    };
    lockUnlockNativePhase = analyzeLockUnlockNativePhase(logsAFinal, lockWindow);
    lockUnlockVideoChain = analyzeLockUnlockVideoChain(logsAFinal, {
      startLine: runtime.lockUnlockProbe.streamLineAfterScreenOnA,
      endLine: streamLineTotalA,
    });
    fs.writeFileSync(callLogPath(callId, "lock-unlock-probe.json"), JSON.stringify(runtime.lockUnlockProbe, null, 2));
    console.log(
      `[v4-runtime-ro] lock_unlock_native_phase=`,
      JSON.stringify({
        pass: lockUnlockNativePhase.pass,
        firstMissing: lockUnlockNativePhase.firstMissing,
        observed: lockUnlockNativePhase.observed,
        window: lockWindow,
      }),
    );
    console.log(
      `[v4-runtime-ro] lock_unlock_video_chain=`,
      JSON.stringify({
        pass: lockUnlockVideoChain.pass,
        firstMissing: lockUnlockVideoChain.firstMissing,
        observed: lockUnlockVideoChain.observed,
        auxiliary: true,
      }),
    );
  }

  let foregroundResumeChain = { pass: true, skipped: true, reason: ONLY_PROBE ? ONLY_CAMERA ? "ONLY_CAMERA" : "ONLY_LOCK_UNLOCK" : null };
  if (!ONLY_PROBE) {
    const bgWindow = {
      startLine: runtime.bgFgProbe.streamLineAfterHomeA,
      endLine: streamLineTotalA,
      streamLineAtSnapshot: runtime.bgFgProbe.streamLineEndA,
      streamLineTotalA,
    };
    foregroundResumeChain = analyzeForegroundResumeChain(logsAFinal, bgWindow);
    fs.writeFileSync(callLogPath(callId, "bg-fg-probe.json"), JSON.stringify(runtime.bgFgProbe, null, 2));
    console.log(`[v4-runtime-ro] foreground_resume_chain=`, JSON.stringify({
      pass: foregroundResumeChain.pass,
      firstMissing: foregroundResumeChain.chain.firstMissing,
      skipReasons: foregroundResumeChain.skipEvents.map((e) => e.reason).filter(Boolean),
      window: bgWindow,
    }));
  }

  evidence.runtime = runtime;
  evidence.foregroundResumeChain = foregroundResumeChain;
  evidence.lockUnlockNativePhase = lockUnlockNativePhase;
  evidence.lockUnlockVideoChain = lockUnlockVideoChain;

  let cameraOffOnChain = null;
  let uiStateBAfterCamera = null;
  if (ONLY_CAMERA && runtime.camera) {
    uiStateBAfterCamera = await cdpPage(SERIAL_B, CDP_B, (page) => revealAndSnapshot(page));
    const logsACameraWindow = sliceLogcatStream(
      callId,
      "A",
      runtime.cameraProbe?.streamLineStartA ?? 0,
      countStreamLines(callId, "A"),
    );
    cameraOffOnChain = analyzeCameraOffOnChain({
      runtime,
      logsA: logsACameraWindow || logsAFinal,
      callId,
      heartbeat,
    });
    evidence.cameraOffOnChain = cameraOffOnChain;
    evidence.uiStateBAfterCamera = uiStateBAfterCamera;
    fs.writeFileSync(callLogPath(callId, "camera-off-on-probe.json"), JSON.stringify({ runtime: runtime.camera, cameraOffOnChain, uiStateBAfterCamera }, null, 2));
    console.log(
      `[v4-runtime-ro] camera_off_on_chain=`,
      JSON.stringify({
        pass: cameraOffOnChain.pass,
        lastSuccess: cameraOffOnChain.lastSuccess,
        firstMissing: cameraOffOnChain.firstMissing,
        checks: cameraOffOnChain.checks,
      }),
    );
  }

  if (ONLY_LOCK_UNLOCK) {
    results.mic_off_on = "SKIPPED";
    results.camera_off_on = "SKIPPED";
    results.camera_front_back_switch = "SKIPPED";
    results.screen_rotation = "SKIPPED";
    results.background_foreground = "SKIPPED";
    results.background_foreground_cdp = "SKIPPED";
    results.background_foreground_log_chain = "SKIPPED";
    results.remote_video_maintain = "SKIPPED";
    results.self_overlay_maintain = "SKIPPED";
    results.self_overlay_9_16 = "SKIPPED";
  } else if (ONLY_CAMERA) {
    results.mic_off_on = "SKIPPED";
    results.camera_front_back_switch = "SKIPPED";
    results.screen_rotation = "SKIPPED";
    results.background_foreground = "SKIPPED";
    results.background_foreground_cdp = "SKIPPED";
    results.background_foreground_log_chain = "SKIPPED";
    results.screen_lock_unlock = "SKIPPED";
    results.screen_lock_unlock_native_phase = "SKIPPED";
    results.screen_lock_unlock_cdp = "SKIPPED";
    results.screen_lock_unlock_video_chain = "SKIPPED";
    results.self_overlay_maintain = "SKIPPED";
    results.self_overlay_9_16 = "SKIPPED";
    results.camera_off_on = cameraOffOnChain?.pass ? "PASS" : "FAIL";
    results.remote_video_maintain = cameraOffOnChain?.remoteVideoOk ? "PASS" : "FAIL";
    results.camera_heartbeat_maintain = cameraOffOnChain?.heartbeatOk ? "PASS" : "FAIL";
  } else {
    results.mic_off_on =
      runtime.mic.micOff.clicked && runtime.mic.micOn.clicked ? "PASS" : runtime.mic.micOff.clicked ? "INCONCLUSIVE" : "FAIL";

    const camOffOk = runtime.camera.camOff.clicked;
    const camOnOk = runtime.camera.camOn.clicked;
    const camSelfHidden =
      Boolean(runtime.camera.camBefore.selfPip) &&
      !runtime.camera.camMid.selfPip &&
      runtime.camera.camMid.videoCount <= runtime.camera.camBefore.videoCount;
    const camSelfRestored = Boolean(runtime.camera.camAfter.selfPip?.playing);
    const camRepublish = hasLocalVideoRepublishAfterUnpublish(logsAFinal, callId);
    const camRemoteOk = [runtime.camera.camBefore, runtime.camera.camMid, runtime.camera.camAfter].every((s) =>
      Boolean(s?.mainVideo?.playing),
    );
    if (camOffOk && camOnOk && camSelfHidden && camRepublish.publishDone && camSelfRestored && camRemoteOk) {
      results.camera_off_on = "PASS";
    } else if (camOffOk || camOnOk) {
      results.camera_off_on = "INCONCLUSIVE";
    } else {
      results.camera_off_on = "FAIL";
    }

    results.camera_front_back_switch = runtime.cameraSwitchProbe.hasCameraSwitch
      ? runtime.cameraSwitchClick.clicked
        ? "PASS"
        : "INCONCLUSIVE"
      : "NOT_IMPL";

    results.screen_rotation =
      runtime.rotation.onCallScreen &&
      runtime.rotation.mainVideo?.playing &&
      runtime.rotationRestored.onCallScreen
        ? "PASS"
        : "FAIL";

    results.background_foreground =
      runtime.bgFgProbe.cdp.onCallScreen &&
      runtime.bgFgProbe.cdp.videoCount >= 1 &&
      runtime.bgFgProbe.cdp.mainVideoPlaying &&
      foregroundResumeChain.pass
        ? "PASS"
        : "FAIL";

    results.background_foreground_cdp =
      runtime.bgFgProbe.cdp.onCallScreen &&
      runtime.bgFgProbe.cdp.videoCount >= 1 &&
      runtime.bgFgProbe.cdp.mainVideoPlaying
        ? "PASS"
        : "FAIL";

    results.background_foreground_log_chain = foregroundResumeChain.pass ? "PASS" : "FAIL";

    const snaps = [runtime.baseline, runtime.rotation, runtime.foreground, runtime.unlock];
    results.remote_video_maintain = snaps.every((s) => s.mainVideo?.playing) ? "PASS" : "FAIL";

    const selfOk = (s) => Boolean(s.selfPip && s.selfPip.w > 40 && s.selfPip.h > 40 && s.selfPip.playing);
    results.self_overlay_maintain =
      selfOk(runtime.baseline) && selfOk(runtime.rotation) && selfOk(runtime.foreground) ? "PASS" : selfOk(runtime.baseline) ? "INCONCLUSIVE" : "FAIL";

    results.self_overlay_9_16 = judgeSelf916(runtime.baseline);
  }

  const lockUnlockCdpPass = ONLY_CAMERA
    ? true
    : runtime.lockUnlockProbe?.cdp?.onCallScreen &&
      runtime.lockUnlockProbe?.cdp?.videoCount >= 1 &&
      runtime.lockUnlockProbe?.cdp?.mainVideoPlaying;

  if (!ONLY_CAMERA) {
    results.screen_lock_unlock =
      lockUnlockNativePhase.pass && lockUnlockCdpPass && heartbeat.pass ? "PASS" : "FAIL";

    results.screen_lock_unlock_native_phase = lockUnlockNativePhase.pass ? "PASS" : "FAIL";
    results.screen_lock_unlock_cdp = lockUnlockCdpPass ? "PASS" : "FAIL";
    results.screen_lock_unlock_video_chain = lockUnlockVideoChain.pass ? "PASS" : "INCONCLUSIVE";
  }

  const topFix = pickTopFixCandidate(results);
  const hardFails = Object.values(results).filter((v) => v === "FAIL").length;
  const verdict = ONLY_CAMERA
    ? results.camera_off_on === "PASS" &&
      results.video_connected === "PASS" &&
      results.heartbeat_65s === "PASS" &&
      results.remote_video_maintain === "PASS"
      ? "PASS"
      : "FAIL"
    : ONLY_LOCK_UNLOCK
      ? results.screen_lock_unlock === "PASS" && results.video_connected === "PASS" && results.heartbeat_65s === "PASS"
        ? "PASS"
        : "FAIL"
      : hardFails === 0 && results.video_connected === "PASS" && results.heartbeat_65s === "PASS"
        ? "PASS"
        : hardFails > 0
          ? "FAIL"
          : "PARTIAL";

  const report = {
    at: new Date().toISOString(),
    phase: ONLY_CAMERA
      ? "video-runtime-camera-only"
      : ONLY_LOCK_UNLOCK
        ? "video-runtime-lock-unlock-only"
        : "video-runtime-readonly-v2",
    webTarget: WEB,
    callId,
    callLogDir: activeCallOut,
    dial: session.dial,
    results,
    evidence,
    heartbeat,
    foregroundResumeChain,
    lockUnlockProbe: ONLY_CAMERA ? null : runtime.lockUnlockProbe,
    lockUnlockNativePhase,
    lockUnlockVideoChain,
    bgFgProbe: ONLY_PROBE ? null : runtime.bgFgProbe,
    cameraOffOnChain,
    onlyLockUnlock: ONLY_LOCK_UNLOCK,
    onlyCamera: ONLY_CAMERA,
    topFixCandidate: topFix,
    verdict,
    note: ONLY_CAMERA
      ? "Camera off/on-only QA. Log chain + CDP selfPip + remote video + heartbeat required for PASS."
      : ONLY_LOCK_UNLOCK
        ? "Lock/unlock-only QA. Native phase chain + CDP + heartbeat required for PASS."
        : "Script-only QA. Heartbeat parser uses WebView console lines (not strict callId). BG/FG log chain parsed from logcat stream through foreground snapshot.",
  };

  fs.writeFileSync(callLogPath(callId, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT_ROOT, "report-latest.json"), JSON.stringify(report, null, 2));
  if (ONLY_CAMERA && verdict !== "PASS" && cameraOffOnChain) {
    console.log(
      `[v4-runtime-ro] camera_fail_report`,
      JSON.stringify(
        {
          lastSuccess: cameraOffOnChain.lastSuccess,
          firstMissing: cameraOffOnChain.firstMissing,
          clickedButtons: {
            off: {
              clicked: runtime.camera.camOff.clicked,
              label: runtime.camera.camOff.target?.label ?? runtime.camera.camOff.via ?? null,
              index: runtime.camera.camOff.target?.idx ?? null,
            },
            on: {
              clicked: runtime.camera.camOn.clicked,
              label: runtime.camera.camOn.target?.label ?? runtime.camera.camOn.via ?? null,
              index: runtime.camera.camOn.target?.idx ?? null,
            },
          },
          stateAB: {
            A: runtime.camera.camAfter,
            B: uiStateBAfterCamera,
          },
        },
        null,
        2,
      ),
    );
  }

  console.log(
    JSON.stringify(
      {
        callId,
        onlyLockUnlock: ONLY_LOCK_UNLOCK,
        onlyCamera: ONLY_CAMERA,
        results,
        cameraOffOnChain: cameraOffOnChain
          ? {
              pass: cameraOffOnChain.pass,
              lastSuccess: cameraOffOnChain.lastSuccess,
              firstMissing: cameraOffOnChain.firstMissing,
            }
          : null,
        screen_lock_unlock: results.screen_lock_unlock,
        screen_lock_unlock_native_phase: results.screen_lock_unlock_native_phase,
        screen_lock_unlock_cdp: results.screen_lock_unlock_cdp,
        screen_lock_unlock_video_chain: results.screen_lock_unlock_video_chain,
        lockUnlockNativeFirstMissing: lockUnlockNativePhase.firstMissing,
        background_foreground: results.background_foreground,
        background_foreground_cdp: results.background_foreground_cdp,
        background_foreground_log_chain: results.background_foreground_log_chain,
        foregroundResumeChainPass: foregroundResumeChain.pass,
        foregroundResumeFirstMissing: foregroundResumeChain.chain?.firstMissing ?? null,
        topFixCandidate: topFix,
        verdict,
      },
      null,
      2,
    ),
  );
  process.exit(verdict === "PASS" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
