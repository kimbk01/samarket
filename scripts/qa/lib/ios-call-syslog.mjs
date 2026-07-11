/**
 * iOS call QA — idevicesyslog capture + DIBAY_CALL / DIBAY_CALL_V4 analysis.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function lineHasCallId(line, callId) {
  if (!callId) return false;
  if (line.includes(callId)) return true;
  const compact = callId.replace(/-/g, "");
  if (compact.length >= 8 && line.includes(compact)) return true;
  if (compact.length >= 8) {
    const prefix = compact.slice(0, 4).toLowerCase();
    const suffix = compact.slice(-4).toLowerCase();
    const lower = line.toLowerCase();
    const maskedEllipsis = `${prefix}…${suffix}`;
    const maskedDots = `${prefix}...${suffix}`;
    if (lower.includes(maskedEllipsis) || lower.includes(maskedDots)) return true;
  }
  return false;
}

export function filterDibayLines(raw) {
  return raw.split("\n").filter((l) => l.includes("DIBAY_CALL") || l.includes("[DIBAY_CALL_V4]"));
}

export function linesForCall(raw, callId) {
  const lines = filterDibayLines(raw);
  if (!callId) return lines;
  return lines.filter((l) => lineHasCallId(l, callId));
}

export function countMarker(raw, marker, callId) {
  return linesForCall(raw, callId).filter((l) => l.includes(marker)).length;
}

export function firstMarkerLines(raw, markers, callId, limit = 5) {
  const hits = {};
  for (const marker of markers) {
    hits[marker] = linesForCall(raw, callId)
      .filter((l) => l.includes(marker))
      .slice(0, limit)
      .map((l) => l.trim());
  }
  return hits;
}

export function fetchIosLogsSinceMinutes(udid, minutes = 4) {
  const r = spawnSync(
    "sh",
    [
      "-c",
      `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer; command log show --device ${udid} --last ${minutes}m --style compact 2>/dev/null | grep -E 'DIBAY_CALL|DIBAY_CALL_V4' || true`,
    ],
    { encoding: "utf8" },
  );
  return r.stdout ?? "";
}

export function startIosSyslogCapture({ udid, outPath, pidPath }) {
  try {
    spawnSync("pkill", ["-f", `idevicesyslog -u ${udid}`]);
  } catch {
    /* noop */
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) fs.writeFileSync(outPath, "");
  const proc = spawnSync(
    "sh",
    ["-c", `nohup idevicesyslog -u ${udid} > "${outPath}" 2>&1 & echo $!`],
    { encoding: "utf8" },
  );
  const pid = (proc.stdout || "").trim();
  if (pidPath) fs.writeFileSync(pidPath, pid);
  return { pid, outPath };
}

export function stopIosSyslogCapture(udid) {
  try {
    spawnSync("pkill", ["-f", `idevicesyslog -u ${udid}`]);
  } catch {
    /* noop */
  }
}

export function readIosSliceSince(rawPath, byteOffset) {
  if (!fs.existsSync(rawPath)) return "";
  return fs.readFileSync(rawPath, "utf8").slice(byteOffset);
}

export function mergeIosLogSources({ slice, udid, minutes = 4 }) {
  return [slice, fetchIosLogsSinceMinutes(udid, minutes)].filter(Boolean).join("\n");
}

export function analyzeIncomingVoiceIos(raw, callId) {
  const callLines = linesForCall(raw, callId);
  const has = (m) => countMarker(raw, m, callId) > 0;
  const connectionChain = [
    "ios_native_voice_answer_started",
    "ios_native_voice_accept_succeeded",
    "ios_native_voice_token_ok",
    "ios_native_voice_agora_join_started",
    "ios_native_voice_callkit_fulfilled",
    "ios_native_voice_agora_local_joined",
    "ios_native_voice_connected",
    "active_call_connected",
  ];
  const uiMarkers = [
    "ios_native_voice_ui_present",
    "ios_native_voice_ui_deferred_locked",
    "ios_native_voice_ui_flush_after_unlock",
    "ios_native_voice_ui_flush_after_presenter_retry",
  ];
  const firstMissingConnection = connectionChain.find((m) => !has(m)) ?? null;
  const connected = has("ios_native_voice_connected") && has("active_call_connected");
  const uiPresent = has("ios_native_voice_ui_present");
  const uiDeferred = has("ios_native_voice_ui_deferred_locked");
  const uiDeferredNoPresenter = callLines.some(
    (l) => l.includes("ios_native_voice_ui_deferred_locked") && l.includes("no_presenter"),
  );
  const answerDuplicate = has("ios_native_voice_begin_accept_duplicate");
  const parityMismatch = countMarker(raw, "ios_call_ssot_parity_mismatch", callId);

  let uiForegroundPass = false;
  let uiForegroundReason = "missing_ios_native_voice_ui_present";
  if (uiPresent && connected) {
    uiForegroundPass = true;
    uiForegroundReason = null;
  } else if (uiDeferred && !uiPresent) {
    uiForegroundReason = uiDeferredNoPresenter
      ? "ui_deferred_no_presenter"
      : "ui_deferred_locked_never_presented";
  } else if (connected && !uiPresent) {
    uiForegroundReason = "connected_without_native_voice_ui";
  }

  const connectionPass =
    connected && !answerDuplicate && parityMismatch === 0 && !has("ios_native_voice_callkit_failed");

  return {
    connectionChain: Object.fromEntries(connectionChain.map((m) => [m, has(m)])),
    uiMarkers: Object.fromEntries(uiMarkers.map((m) => [m, has(m)])),
    firstMissingConnection,
    connected,
    uiPresent,
    uiDeferred,
    uiDeferredNoPresenter,
    answerDuplicate,
    parityMismatch,
    connectionPass,
    uiForegroundPass,
    uiForegroundReason,
    evidenceLines: firstMarkerLines(
      raw,
      [...connectionChain, ...uiMarkers, "ios_native_voice_callkit_failed"],
      callId,
      3,
    ),
    callLineCount: callLines.length,
  };
}

export function analyzeOutgoingVoiceIos(raw, callId) {
  const webMarkers = [
    "call_v4_launch_direct_enter",
    "outgoing_create_session_done",
    "outgoing_ringing",
    "route_to_screen",
    "agora_join_start",
    "agora_join_success",
    "state_connected",
  ];
  const nativeForbidden = [
    "startNativeOutgoingEstablishment",
    "native_outgoing_handoff_done",
    "ios_native_voice_outgoing",
  ];
  const has = (m) => countMarker(raw, m, callId) > 0;
  const webCounts = Object.fromEntries(webMarkers.map((m) => [m, countMarker(raw, m, callId)]));
  const forbiddenCounts = Object.fromEntries(
    nativeForbidden.map((m) => [m, countMarker(raw, m, callId)]),
  );
  const firstMissingWeb = webMarkers.find((m) => !has(m)) ?? null;
  const connected = has("agora_join_success") || has("state_connected");
  const webPathEntered = has("outgoing_ringing") || has("route_to_screen");
  const nativeLeak = Object.values(forbiddenCounts).some((n) => n > 0);

  const connectionPass = connected && webPathEntered && !nativeLeak;
  let failReason = null;
  if (!webPathEntered) failReason = "web_outgoing_path_not_entered";
  else if (nativeLeak) failReason = "native_outgoing_leak_detected";
  else if (!connected) failReason = firstMissingWeb ? `missing_${firstMissingWeb}` : "not_connected";

  return {
    webCounts,
    forbiddenCounts,
    firstMissingWeb,
    connected,
    webPathEntered,
    nativeLeak,
    connectionPass,
    failReason: connectionPass ? null : failReason,
    evidenceLines: firstMarkerLines(raw, [...webMarkers, ...nativeForbidden], callId, 3),
  };
}
