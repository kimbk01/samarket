#!/usr/bin/env node
/**
 * CUT7 — Android Missed device runtime proof (NO CODE CHANGE).
 * LOCKED Voice (default) — no Accept / no Reject — natural ring expire.
 *
 *   KIND=voice|video STATE=LOCKED \
 *     node scripts/qa/cut7-android-missed-device-proof.mjs
 *
 * Caller: Xiaomi 8b37179f7d94 (wwww)
 * Callee: Samsung RFCY40PY2CA (qqqq)
 * Room:   c202326f-8109-4ce4-aa61-394f0a799e7d
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { forwardCdp, connectWebView } from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const SERIAL_A = process.env.CUT7_DEVICE_A || "8b37179f7d94";
const SERIAL_B = process.env.CUT7_DEVICE_B || "RFCY40PY2CA";
const CDP_PORT = Number(process.env.CUT7_CDP_PORT || 9588);
const ROOM = process.env.CUT7_ANDROID_ROOM || "c202326f-8109-4ce4-aa61-394f0a799e7d";
const ORIGIN = (process.env.CUT7_ORIGIN || "https://samarket.vercel.app").replace(/\/$/, "");
const KIND = (process.env.KIND || "voice").toLowerCase() === "video" ? "video" : "voice";
const STATE = (process.env.STATE || "LOCKED").toUpperCase() === "BG" ? "BG" : "LOCKED";
const WAIT_MS = Math.max(70000, Number(process.env.MISSED_WAIT_MS || 95000));
const OUT = path.join(ROOT, `docs/perf/cut7-android-missed-device-${KIND}-${STATE.toLowerCase()}.json`);
const LOG = `/tmp/cut7-android-missed-${KIND}-${STATE}.logcat`;
const LOG_PID = `/tmp/cut7-android-missed-${KIND}-${STATE}.pid`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
function sh(serial, ...args) {
  const r = adb(serial, ...args);
  return `${r.stdout ?? ""}${r.stderr ?? ""}`;
}
function wake(s) {
  sh(s, "shell", "input", "keyevent", "224");
  sh(s, "shell", "input", "keyevent", "82");
}
function unlockB() {
  wake(SERIAL_B);
  sh(SERIAL_B, "shell", "wm", "dismiss-keyguard");
  sh(SERIAL_B, "shell", "input", "keyevent", "82");
}
function lockB() {
  unlockB();
  sh(SERIAL_B, "shell", "input", "keyevent", "26");
}
function bgB() {
  unlockB();
  sh(SERIAL_B, "shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  sleep(1500);
  sh(SERIAL_B, "shell", "input", "keyevent", "3");
}

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchSession(callId) {
  const admin = adminClient();
  const { data } = await admin
    .from("community_messenger_call_sessions")
    .select(
      "id,room_id,status,call_kind,initiator_user_id,recipient_user_id,ended_reason,started_at,answered_at,ended_at,created_at",
    )
    .eq("id", callId)
    .maybeSingle();
  return data;
}

async function waitSessionStatus(callId, statuses, timeoutMs) {
  const want = new Set(statuses);
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await fetchSession(callId);
    if (last && want.has(last.status)) return last;
    await sleep(2000);
  }
  return last;
}

function dumpUi() {
  const power = sh(SERIAL_B, "shell", "dumpsys", "power");
  const win = sh(SERIAL_B, "shell", "dumpsys", "window");
  const activity = sh(SERIAL_B, "shell", "dumpsys", "activity", "activities");
  const activeNotif = sh(SERIAL_B, "shell", "cmd", "notification", "list");
  const nativeTop = /topResumedActivity=.*Native(?:Voice|Video)CallActivity|mFocusedApp=.*Native(?:Voice|Video)CallActivity/.test(
    activity + win,
  );
  const callNotifActive = /com\.dibay\.app\|94\d{3}\|/.test(activeNotif);
  return {
    wakefulness: (power.match(/mWakefulness=\w+/) || [])[0] || null,
    nativeCallActivityPresent: nativeTop,
    focusedApp: (win.match(/mFocusedApp=ActivityRecord\{[^}]+\}/) || [])[0] || null,
    topResumed: (activity.match(/topResumedActivity=[^\n]+/) || [])[0] || null,
    incomingNotifLikely: callNotifActive,
    activeNotifSample: activeNotif
      .split("\n")
      .filter((l) => /dibay|94\d{3}/i.test(l))
      .slice(0, 8),
  };
}

function startLogcat() {
  fs.writeFileSync(LOG, "");
  adb(SERIAL_B, "logcat", "-c");
  const child = spawn(
    ADB,
    [
      "-s",
      SERIAL_B,
      "logcat",
      "-v",
      "time",
      "DIBAY_CALL:I",
      "DIBAY_NATIVE_VOICE:I",
      "DIBAY_NATIVE_VIDEO:I",
      "DIBAY_FCM:I",
      "IncomingCallRingOwner:I",
      "RingtonePlayer:I",
      "*:S",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const out = fs.createWriteStream(LOG, { flags: "a" });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  fs.writeFileSync(LOG_PID, String(child.pid));
  return child;
}

function stopLogcat(child) {
  try {
    if (child && !child.killed) child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  if (fs.existsSync(LOG_PID)) fs.unlinkSync(LOG_PID);
}

function analyzeLog(full, callId) {
  const short = callId ? callId.replace(/-/g, "").slice(0, 8) : "";
  const lines = full.split("\n").filter((l) => {
    if (!callId) return true;
    return l.includes(callId) || (short && l.toLowerCase().includes(short.toLowerCase()));
  });
  const joined = lines.join("\n");
  const all = full;
  const ringStarts = (all.match(/ring_start/g) || []).length;
  const ringStops = (all.match(/ring_stop|IncomingCallRingOwner.*stop|ring_owner_stop/gi) || []).length;
  const fcm =
    /fcm.*(incoming|call)|incoming_fcm|onMessageReceived|native_incoming|fullscreen_intent|incoming_notification_post/i.test(
      all,
    ) || /incoming_call|place_incoming|NativeVoiceCallRuntime|NativeVideoCallRuntime/i.test(joined);
  const presentation =
    /NativeVoiceCallActivity|NativeVideoCallActivity|incoming_notification_post_done|fullscreen_intent|incoming_presented|present_incoming/i.test(
      all,
    );
  const propose = /missed_propose callId=|missed_propose /.test(all) || /missed_propose/.test(joined);
  const earlyReject = /missed_early_rejected/.test(all);
  const retryScheduled = /missed_retry_scheduled/.test(all);
  const retryCount = (all.match(/missed_retry_scheduled/g) || []).length;
  const canonicalAccepted = /missed_canonical_accepted|missed_patch_done/.test(all);
  const prematureCleanup =
    /runtime_cleanup_start[^\n]*reason=missed/.test(all) &&
    !/missed_canonical_accepted/.test(all) &&
    /missed_early_rejected/.test(all) &&
    all.search(/runtime_cleanup_start[^\n]*reason=missed/) < all.search(/missed_early_rejected/);
  const terminalReceived =
    /terminal_received|call_missed|native_end_dispatch|onRemoteTerminal|terminal_handler_done|native_terminal|missed_canonical_accepted|runtime_cleanup_start[^\n]*reason=missed/i.test(
      joined + "\n" + all,
    );
  const terminalMissed =
    /terminal_received[^\n]*kind=missed|missed_canonical_accepted|runtime_cleanup_start[^\n]*reason=missed|call_missed|native_end_dispatch[^\n]*kind=missed/i.test(
      joined + "\n" + all,
    );
  const notifClear =
    /incoming_notification_cancel|cancel_incoming|purgeCallPresentation|notification_cleared|terminal_handler_done|IncomingCallSessionCleanup/i.test(
      all,
    );
  const activityClose =
    /finishIncoming|Activity.*finish|cleanup_done|purgeCallPresentation|native_voice_cleanup|native_video_cleanup|callkit_end|incoming_activity_finish/i.test(
      all,
    );
  const rpAfter = (all.match(/RingtonePlayer.*(play|start)/gi) || []).length;
  // Premature: cleanup/ring_stop before canonical accept, or cleanup while only early-reject seen
  const cleanupIdx = all.search(/runtime_cleanup_start[^\n]*reason=missed/);
  const acceptIdx = all.search(/missed_canonical_accepted/);
  const earlyIdx = all.search(/missed_early_rejected/);
  const premature =
    cleanupIdx >= 0 && (acceptIdx < 0 || cleanupIdx < acceptIdx) && (earlyIdx >= 0 || propose);
  return {
    callLines: lines.slice(0, 80),
    sampleTerminal: lines.filter((l) => /terminal|missed|ring_|cleanup|notification/i.test(l)).slice(0, 50),
    fcmReceived: fcm,
    presentation,
    ringStartCount: ringStarts,
    ringStopEvidence: ringStops > 0 || /IncomingCallRingOwner\.stop|ring_stop/i.test(all),
    terminalReceived,
    terminalMissed,
    notifClearEvidence: notifClear || /cleanup_done[^\n]*reason=missed|missed_canonical_accepted/i.test(all),
    activityCloseEvidence: activityClose || /cleanup_done[^\n]*reason=missed/i.test(all),
    ringtonePlayerEvents: rpAfter,
    ringOwnerStart: ringStarts >= 1 || /IncomingCallRingOwner|source=ring_owner/i.test(all),
    propose,
    earlyReject,
    retryScheduled,
    retryCount,
    canonicalAccepted,
    prematureCleanup: premature,
  };
}

function classifyBoundary(out) {
  if (out.SERVER_FINAL_STATUS !== "missed") return "A.server never transitions missed";
  if (!out.TERMINAL_DELIVERY_TO_ANDROID) return "B.server becomes missed but Android terminal delivery missing";
  if (!out.INCOMING_ACTIVITY_CLOSED) return "C.Android terminal received but Activity remains";
  if (!out.NOTIFICATION_CLEARED) return "D.notification remains";
  if (!out.RINGOWNER_STOP) return "E.RingOwner does not stop";
  if (out.AUDIBLE_SOUND_AFTER_TERMINAL === "PRESENT" || out.STALE_UI === "PRESENT") {
    return "E/F.cleanup incomplete (audible or stale UI)";
  }
  return "F.all cleanup works";
}

async function main() {
  loadEnv();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("missing supabase env");
  }

  if (STATE === "LOCKED") lockB();
  else await bgB();
  await sleep(1000);

  const lc = startLogcat();
  await sleep(500);

  wake(SERIAL_A);
  sh(SERIAL_A, "shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  await sleep(4000);
  forwardCdp((s, ...a) => adb(s, ...a), SERIAL_A, CDP_PORT);
  const { browser, page } = await connectWebView(chromium, CDP_PORT);
  await page.evaluate((u) => {
    window.location.href = u;
  }, `${ORIGIN}/community-messenger?section=chats`);
  await sleep(3500);

  const placed = await page.evaluate(
    async ({ roomId, kind }) => {
      const r = await fetch(`/api/community-messenger/rooms/${roomId}/calls`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ callKind: kind, dialIntent: "fresh" }),
      });
      const j = await r.json().catch(() => ({}));
      return { status: r.status, callId: j?.session?.id || j?.id || null, j };
    },
    { roomId: ROOM, kind: KIND },
  );
  console.log("placed", { status: placed.status, callId: placed.callId });

  if (!placed.callId) {
    stopLogcat(lc);
    await browser.close().catch(() => {});
    throw new Error("no callId");
  }

  // Confirm incoming presentation early (do not accept/reject)
  await sleep(8000);
  const midUi = dumpUi();
  const midLog = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "";
  const midObs = analyzeLog(midLog, placed.callId);
  console.log("mid", {
    presentation: midObs.presentation || midUi.nativeCallActivityPresent,
    ring: midObs.ringStartCount,
    ui: midUi.topResumed,
  });

  // Snapshot after native 30s propose window (expect early reject keep presentation when policy=45)
  await sleep(28000);
  const earlyUi = dumpUi();
  const earlyLog = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "";
  const earlyObs = analyzeLog(earlyLog, placed.callId);
  console.log("early", {
    propose: earlyObs.propose,
    earlyReject: earlyObs.earlyReject,
    retry: earlyObs.retryCount,
    activity: earlyUi.nativeCallActivityPresent,
    ringStop: earlyObs.ringStopEvidence,
  });

  // Wait natural miss — DO NOT cancel / reject / accept
  const sess = await waitSessionStatus(
    placed.callId,
    ["missed", "cancelled", "ended", "failed", "rejected"],
    Math.max(40000, WAIT_MS - 36000),
  );
  // Extra settle for FCM + UI cleanup after server missed
  await sleep(6000);

  const finalLog = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "";
  const obs = analyzeLog(finalLog, placed.callId);
  const finalUi = dumpUi();
  const finalSess = (await fetchSession(placed.callId)) || sess;

  const startedAt = finalSess?.started_at || finalSess?.created_at || null;
  const { data: pol } = await adminClient()
    .from("admin_messenger_call_sound_settings")
    .select("incoming_ring_timeout_seconds")
    .limit(1)
    .maybeSingle();
  const policyTimeoutSec = Number(pol?.incoming_ring_timeout_seconds || 30);
  let ringDeadline = null;
  if (startedAt) {
    const t = Date.parse(startedAt);
    if (!Number.isNaN(t)) ringDeadline = new Date(t + policyTimeoutSec * 1000).toISOString();
  }

  const serverMissed = finalSess?.status === "missed";
  const incomingPresentationEarly = midObs.presentation || midUi.nativeCallActivityPresent ? "PASS" : "FAIL";
  const activityClosed = !finalUi.nativeCallActivityPresent;
  const notifCleared = !finalUi.incomingNotifLikely;
  const ringStopAfterAccept =
    obs.canonicalAccepted &&
    /missed_canonical_accepted[\s\S]*?ring_stop|ring_stop[\s\S]{0,200}missed_canonical_accepted|cleanup_done[^\n]*reason=missed[\s\S]*?ring_stop|ring_stop/.test(
      finalLog,
    );
  const ringStop = obs.canonicalAccepted
    ? /ring_stop/.test(finalLog.slice(finalLog.search(/missed_canonical_accepted/)))
    : obs.ringStopEvidence;
  let audibleSoundAfterTerminal = "NONE";
  const acceptIdx = finalLog.search(/missed_canonical_accepted/);
  if (acceptIdx >= 0) {
    const after = finalLog.slice(acceptIdx);
    if ((after.match(/ring_start/g) || []).length > 0) audibleSoundAfterTerminal = "PRESENT";
  }

  const uiAfterEarly =
    earlyObs.earlyReject || earlyObs.propose
      ? earlyUi.nativeCallActivityPresent || /NativeVoiceCallActivity|NativeVideoCallActivity/.test(String(earlyUi.topResumed || ""))
        ? "VISIBLE"
        : earlyObs.ringStopEvidence
          ? "CLOSED"
          : "VISIBLE"
      : "N/A";
  const ringAfterEarly =
    earlyObs.earlyReject || earlyObs.propose
      ? earlyObs.ringStopEvidence
        ? "STOPPED"
        : "RUNNING"
      : "N/A";

  const staleUi =
    finalUi.nativeCallActivityPresent || finalUi.incomingNotifLikely ? "PRESENT" : "NONE";

  const missedWriter =
    finalSess?.ended_reason ||
    (serverMissed ? "server_status_missed" : "none");

  const out = {
    TITLE: "CUT7 ANDROID MISSED — CANONICAL BOUNDARY CLOSE",
    HEAD: spawnSync("git", ["rev-parse", "--short=9", "HEAD"], { encoding: "utf8", cwd: ROOT }).stdout.trim(),
    WORKTREE: "dirty — eligibility + missed retry + Android channel v2 + Android missed proposer",
    DEVICE: SERIAL_B,
    STATE,
    KIND,
    CALL_ID: placed.callId,
    ROOM_ID: ROOM,
    SERVER_POLICY_TIMEOUT: policyTimeoutSec,
    FCM_RECEIVED: midObs.fcmReceived || obs.fcmReceived ? "PASS" : "FAIL",
    INCOMING_PRESENTATION: incomingPresentationEarly,
    RINGOWNER_START: midObs.ringOwnerStart || obs.ringOwnerStart ? "YES" : "NO",
    AUDIBLE_RING:
      midObs.ringStartCount >= 2 ? "DUPLICATE" : midObs.ringStartCount >= 1 || obs.ringStartCount >= 1 ? "ONE" : "NONE",
    SERVER_STARTED_AT: startedAt,
    SERVER_RING_DEADLINE: ringDeadline,
    FIRST_PROPOSAL: earlyObs.propose || obs.propose ? "YES" : "NO",
    FIRST_SERVER_RESULT: earlyObs.earlyReject
      ? "ring_deadline_not_reached"
      : obs.canonicalAccepted
        ? "accepted"
        : "unknown",
    EARLY_REJECT: earlyObs.earlyReject || obs.earlyReject ? "YES" : "NO",
    UI_AFTER_EARLY_REJECT: uiAfterEarly,
    RINGOWNER_AFTER_EARLY_REJECT: ringAfterEarly,
    RETRY_SCHEDULED: earlyObs.retryScheduled || obs.retryScheduled ? "YES" : "NO",
    RETRY_COUNT: obs.retryCount || earlyObs.retryCount || 0,
    CANONICAL_MISSED_ACCEPTED: obs.canonicalAccepted ? "YES" : "NO",
    PREMATURE_CLEANUP: obs.prematureCleanup ? "PRESENT" : "ABSENT",
    MISSED_TRANSITION: serverMissed ? "YES" : "NO",
    MISSED_WRITER: missedWriter,
    SERVER_FINAL_STATUS: finalSess?.status || null,
    TERMINAL_DELIVERY_TO_ANDROID: obs.terminalReceived || obs.terminalMissed || obs.canonicalAccepted ? "YES" : "NO",
    TERMINAL_TYPE: obs.canonicalAccepted
      ? "missed_patch_accepted"
      : obs.terminalMissed
        ? "missed"
        : obs.terminalReceived
          ? "other_terminal"
          : "none",
    INCOMING_ACTIVITY_CLOSED: activityClosed ? "YES" : "NO",
    NOTIFICATION_CLEARED: notifCleared ? "YES" : "NO",
    RINGOWNER_STOP: ringStop ? "YES" : "NO",
    AUDIBLE_SOUND_AFTER_TERMINAL: audibleSoundAfterTerminal,
    STALE_UI: staleUi,
    CALL_ID_MATCH: finalSess?.id === placed.callId ? "MATCH" : "FAIL",
    ROOM_ID_MATCH: finalSess?.room_id === ROOM ? "MATCH" : "FAIL",
    FIRST_PASS_FAIL_BOUNDARY: null,
    session: finalSess,
    midUi,
    earlyUi,
    finalUi,
    earlyObs,
    obs: {
      ...obs,
      midRingStarts: midObs.ringStartCount,
      ringStopAfterAccept,
    },
    CODE_CHANGE: "YES — Android missed proposer-only + retry",
  };

  out.FIRST_PASS_FAIL_BOUNDARY = classifyBoundary({
    SERVER_FINAL_STATUS: out.SERVER_FINAL_STATUS,
    TERMINAL_DELIVERY_TO_ANDROID: out.TERMINAL_DELIVERY_TO_ANDROID === "YES",
    INCOMING_ACTIVITY_CLOSED: out.INCOMING_ACTIVITY_CLOSED === "YES",
    NOTIFICATION_CLEARED: out.NOTIFICATION_CLEARED === "YES",
    RINGOWNER_STOP: out.RINGOWNER_STOP === "YES",
    AUDIBLE_SOUND_AFTER_TERMINAL: out.AUDIBLE_SOUND_AFTER_TERMINAL,
    STALE_UI: out.STALE_UI,
  });

  const pass =
    out.INCOMING_PRESENTATION === "PASS" &&
    out.SERVER_FINAL_STATUS === "missed" &&
    out.CANONICAL_MISSED_ACCEPTED === "YES" &&
    out.PREMATURE_CLEANUP === "ABSENT" &&
    out.INCOMING_ACTIVITY_CLOSED === "YES" &&
    out.NOTIFICATION_CLEARED === "YES" &&
    out.RINGOWNER_STOP === "YES" &&
    out.AUDIBLE_SOUND_AFTER_TERMINAL === "NONE" &&
    out.STALE_UI === "NONE" &&
    out.CALL_ID_MATCH === "MATCH" &&
    out.ROOM_ID_MATCH === "MATCH" &&
    (out.EARLY_REJECT === "NO" ||
      (out.UI_AFTER_EARLY_REJECT === "VISIBLE" &&
        out.RINGOWNER_AFTER_EARLY_REJECT === "RUNNING" &&
        out.RETRY_SCHEDULED === "YES"));

  out.VERDICT = pass ? "DEVICE_CLOSED_CELL" : "FAIL";
  out.FIRST_DIVERGENCE = pass ? "NONE" : out.FIRST_PASS_FAIL_BOUNDARY;

  // Safety: if somehow still ringing, cancel so devices don't stay stuck (post-measurement only)
  if (finalSess && ["ringing", "connecting", "accepted", "active"].includes(finalSess.status)) {
    await page
      .evaluate(async (id) => {
        await fetch(`/api/community-messenger/calls/sessions/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        });
      }, placed.callId)
      .catch(() => {});
    out.notes = ["safety_cancel_after_measurement_still_live"];
  }

  stopLogcat(lc);
  await browser.close().catch(() => {});
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        CALL_ID: out.CALL_ID,
        SERVER: out.SERVER_FINAL_STATUS,
        POLICY: out.SERVER_POLICY_TIMEOUT,
        EARLY_REJECT: out.EARLY_REJECT,
        UI_AFTER_EARLY: out.UI_AFTER_EARLY_REJECT,
        RING_AFTER_EARLY: out.RINGOWNER_AFTER_EARLY_REJECT,
        RETRY: out.RETRY_COUNT,
        ACCEPTED: out.CANONICAL_MISSED_ACCEPTED,
        PREMATURE: out.PREMATURE_CLEANUP,
        UI: out.INCOMING_ACTIVITY_CLOSED,
        NOTIF: out.NOTIFICATION_CLEARED,
        RING_STOP: out.RINGOWNER_STOP,
        STALE: out.STALE_UI,
        VERDICT: out.VERDICT,
      },
      null,
      2,
    ),
  );
  console.log("wrote", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
