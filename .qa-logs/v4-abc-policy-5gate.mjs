#!/usr/bin/env node
/**
 * BUNDLE: call-v4-incoming-fsi-fallback
 * Manifest: scripts/call-v4-incoming-fsi-fallback-manifest.json
 * DO NOT merge gates into other QA harnesses or product Java/Web outside the manifest.
 *
 * Call V4 A/B/C policy — real FCM 5-gate device QA.
 * G1 lock/sleep UI1 · G2 background UI1+accept · G3 lock+launcher stack · G4 accept/missed · G5 redial owner cleanup
 *
 * Run: npm run qa:call-v4-5gate
 * Verify: npm run verify:call-v4-incoming-fsi-fallback-boundary
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
  forwardCdp,
  connectWebView,
  refreshApkFcmRegisterTail,
} from "../scripts/qa/lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, ".qa-logs", "v4-abc-policy-5gate");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = DIBAY_PKG;
const ACT = `${PKG}/.MainActivity`;
const INCOMING_ACT = `${PKG}/.IncomingCallActivity`;
const VERCEL = process.env.CAPACITOR_SERVER_URL?.trim() || "https://samarket.vercel.app";
const SERIAL_A = process.env.P4_DEVICE_A?.trim() || "8b37179f7d94";
const SERIAL_B = process.env.P4_DEVICE_B?.trim() || "RFCY40PY2CA";
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const ROOM_ID = "b19e2672-f26f-4a2e-8125-52575da4a62a";
const PASSWORD = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
const ACCEPT_ID = "com.dibay.app:id/incoming_call_accept";
const DECLINE_ID = "com.dibay.app:id/incoming_call_decline";

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

function supabaseAdmin() {
  loadEnvLocal();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
    { auth: { persistSession: false } },
  );
}

async function endActiveCalls() {
  const sb = supabaseAdmin();
  await sb
    .from("community_messenger_call_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString(), ended_reason: "qa_cleanup" })
    .in("status", ["ringing", "connecting", "connected"])
    .or(`initiator_user_id.eq.${USER_A},callee_user_id.eq.${USER_A},initiator_user_id.eq.${USER_B},callee_user_id.eq.${USER_B}`);
}

function logcatFiltered(serial) {
  const raw = adb(serial, "logcat", "-d");
  return raw
    .split("\n")
    .filter((l) =>
      /DIBAY_CALL_V4|DIBAY_INCOMING_CALL|DIBAY_FCM|DIBAY_CALL_FLOW|DIBAY_CALL_PUSH|full_screen_intent|fsi_attached|ringtone_|missed_timeout|incoming_owner|coordinator_accept|accept_start|native_accept_start|main_activity_v4_accept|main_activity_calls_v4_direct|native_connecting_surface|incoming_activity_action_accept|BAL_BLOCK|Background activity launch blocked/.test(
        l,
      ),
    )
    .join("\n");
}

function countFsiAttached(logText, callId) {
  return logText
    .split("\n")
    .filter((l) => l.includes("fsi_attached") && (!callId || l.includes(callId)))
    .length;
}

function extractMarkers(logText, callId) {
  const lines = logText.split("\n");
  const scopedLines = callId ? lines.filter((l) => l.includes(callId)) : lines;
  const has = (m) => lines.some((l) => l.includes(m));
  const hasScoped = (m) => scopedLines.some((l) => l.includes(m));
  const hasScopedRegex = (re) => scopedLines.some((l) => re.test(l));
  const countScoped = (m) => scopedLines.filter((l) => l.includes(m)).length;
  const ringStarts = countScoped("ringtone_start_native");
  const ringStops = countScoped("ringtone_stop_native");
  const fsiAttachedCount = callId ? countFsiAttached(logText, callId) : countFsiAttached(logText, null);
  return {
    fcm_incoming: hasScoped("incoming_call_received") || hasScoped("fcm_incoming_received"),
    fsi_attached: fsiAttachedCount >= 1,
    fsi_attached_count: fsiAttachedCount,
    fsi_duplicate: fsiAttachedCount > 1,
    lock_fsi_only: hasScoped("lock_incoming_fsi_only"),
    native_activity_launch_start: hasScoped("native_activity_launch_start"),
    native_activity_launch_result: hasScoped("native_activity_launch_result"),
    incoming_activity_shown: hasScopedRegex(/\bincoming_activity_shown callId=/),
    launch_unverified_fallback: hasScopedRegex(/\blaunch_unverified_fallback\b(?!_skipped)/),
    launch_unverified_fallback_count: scopedLines.filter((l) =>
      /\blaunch_unverified_fallback\b(?!_skipped)/.test(l),
    ).length,
    launch_visibility_verified: hasScoped("launch_visibility_verified"),
    native_notification_fallback: hasScoped("native_notification_fallback"),
    native_notification_fallback_count: countScoped("native_notification_fallback"),
    bal_guard_fallback_count: countScoped("bal_guard_fallback"),
    bal_block_detected: has("BAL_BLOCK") || has("Background activity launch blocked"),
    manual_launch_blocked_on_lock:
      !hasScoped("outside_app_incoming_activity_launch") ||
      !hasScoped("lock_incoming_fsi_only") ||
      logText.indexOf("lock_incoming_fsi_only") < logText.indexOf("outside_app_incoming_activity_launch") ||
      !logText.includes("outside_app_incoming_activity_launch"),
    owner_cleared: hasScoped("incoming_owner_cleared"),
    owner_transition: hasScoped("incoming_owner_decided"),
    ring_start_count: ringStarts,
    ring_stop_count: ringStops,
    missed_timeout: hasScoped("missed_timeout"),
    foreground_web_ssot: has("incoming_call_foreground_web_ssot"),
    accept_start:
      hasScoped("native_accept_start") ||
      hasScoped("accept_start") ||
      hasScoped("coordinator_accept_enter"),
    main_activity_v4_accept:
      hasScoped("main_activity_calls_v4_direct_start") ||
      hasScoped("main_activity_v4_accept_start"),
    screen_mounted: hasScoped("screen_mounted"),
    callIdPresent: callId ? has(callId) : false,
    keyguard_locked_in_fcm: /keyguardLocked=true/.test(logText),
    keyguard_unlocked_in_fcm: /keyguardLocked=false/.test(logText),
  };
}

async function waitForFallbackNotification(serial, callId, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = logcatFiltered(serial);
    if (
      callId &&
      logs.includes(callId) &&
      logs.includes("native_notification_fallback")
    ) {
      return { ok: true, reason: "native_notification_fallback" };
    }
    await sleep(800);
  }
  return { ok: false, reason: "timeout" };
}

/** g2-fallback-notification.png / split 검증 성공 좌표 (1080×2340) */
const CALIBRATED_HEADS_UP_ACCEPT = { x: 820, y: 318, bounds: "calibrated_heads_up" };
const CALIBRATED_EXPANDED_ACCEPT = { x: 774, y: 971, bounds: "[540,891][1009,1051]" };
const FALLBACK_ACCEPT_LABELS = ["통화", "수락", "Accept", "Answer", "Call"];
const FALLBACK_DECLINE_LABELS = ["거절", "Decline", "Reject"];
/** heads-up만 있을 때 y>900 오프스크린 노드 탭 금지 — expand-notifications 우선 */
const HEADS_UP_OFFSCREEN_Y = 900;

function dumpUi(serial) {
  adbObj(serial, "shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  return adb(serial, "shell", "cat", "/sdcard/uidump.xml");
}

function findAcceptButtonInXml(xml) {
  const hits = [];
  for (const label of FALLBACK_ACCEPT_LABELS) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`(?:text|content-desc)="${esc}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "g"),
      new RegExp(`bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*(?:text|content-desc)="${esc}"`, "g"),
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(xml)) !== null) {
        const x1 = Number(m[1]);
        const y1 = Number(m[2]);
        const x2 = Number(m[3]);
        const y2 = Number(m[4]);
        hits.push({
          label,
          x: Math.floor((x1 + x2) / 2),
          y: Math.floor((y1 + y2) / 2),
          bounds: `[${x1},${y1}][${x2},${y2}]`,
          right: x2,
        });
      }
    }
  }
  if (hits.length === 0) return null;
  const onScreen = hits.filter((h) => h.y <= HEADS_UP_OFFSCREEN_Y);
  if (onScreen.length === 0) return null;
  onScreen.sort((a, b) => a.y - b.y);
  return onScreen[0];
}

function findDeclineButtonInXml(xml) {
  const hits = [];
  for (const label of FALLBACK_DECLINE_LABELS) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`(?:text|content-desc)="${esc}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "g"),
      new RegExp(`bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*(?:text|content-desc)="${esc}"`, "g"),
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(xml)) !== null) {
        const x1 = Number(m[1]);
        const y1 = Number(m[2]);
        const x2 = Number(m[3]);
        const y2 = Number(m[4]);
        const y = Math.floor((y1 + y2) / 2);
        if (y > HEADS_UP_OFFSCREEN_Y) continue;
        hits.push({
          label,
          x: Math.floor((x1 + x2) / 2),
          y,
          bounds: `[${x1},${y1}][${x2},${y2}]`,
        });
      }
    }
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.y - b.y);
  return hits[0];
}

function extractAcceptChain(logText, callId) {
  const scoped = callId ? logText.split("\n").filter((l) => l.includes(callId)) : logText.split("\n");
  const has = (m) => scoped.some((l) => l.includes(m));
  return {
    incoming_activity_action_accept_received: has("incoming_activity_action_accept_received"),
    incoming_activity_action_accept_before_coordinator: has("incoming_activity_action_accept_before_coordinator"),
    coordinator_accept_enter: has("coordinator_accept_enter"),
    accept_start: has("native_accept_start") || has("accept_start"),
    main_activity_v4_accept_start:
      has("main_activity_calls_v4_direct_start") || has("main_activity_v4_accept_start"),
    missed_timeout: has("missed_timeout"),
    fallback_accept_pi_created: has("fallback_accept_pi_created"),
  };
}

function fallbackAcceptChainComplete(chain) {
  return (
    chain.incoming_activity_action_accept_received &&
    chain.incoming_activity_action_accept_before_coordinator &&
    chain.coordinator_accept_enter &&
    chain.accept_start &&
    chain.main_activity_v4_accept_start &&
    !chain.missed_timeout
  );
}

async function tapFallbackNotificationAccept(serial) {
  const openedAt = Date.now();
  const attempts = [];

  adb(serial, "shell", "cmd", "statusbar", "expand-notifications");
  await sleep(1500);

  for (let i = 0; i < 3; i++) {
    const xml = dumpUi(serial);
    const found = findAcceptButtonInXml(xml);
    if (found) {
      adb(serial, "shell", "input", "tap", String(found.x), String(found.y));
      const result = {
        tapped: true,
        x: found.x,
        y: found.y,
        label: found.label,
        bounds: found.bounds,
        method: "uiautomator_expanded",
        openedAt,
        attempts: [
          ...attempts,
          { tapped: true, method: "uiautomator_expanded", label: found.label, bounds: found.bounds, x: found.x, y: found.y },
        ],
      };
      return result;
    }
    await sleep(400);
    attempts.push({ tapped: false, method: "uiautomator_expanded_retry", attempt: i + 1 });
  }

  adb(serial, "shell", "input", "tap", String(CALIBRATED_EXPANDED_ACCEPT.x), String(CALIBRATED_EXPANDED_ACCEPT.y));
  return {
    tapped: true,
    x: CALIBRATED_EXPANDED_ACCEPT.x,
    y: CALIBRATED_EXPANDED_ACCEPT.y,
    label: "통화",
    bounds: CALIBRATED_EXPANDED_ACCEPT.bounds,
    method: "calibrated_expanded",
    openedAt,
    attempts: [
      ...attempts,
      { tapped: true, method: "calibrated_expanded", ...CALIBRATED_EXPANDED_ACCEPT },
    ],
  };
}

function activityStack(serial) {
  const d = adb(serial, "shell", "dumpsys", "activity", "activities");
  const histIncoming = (d.match(/Hist\s+#\d+: ActivityRecord\{[^}]*IncomingCallActivity/g) ?? []).length;
  const histMain = (d.match(/Hist\s+#\d+: ActivityRecord\{[^}]*MainActivity/g) ?? []).length;
  const top = d.match(/topResumedActivity=ActivityRecord\{[^\n]*/)?.[0] ?? "";
  return {
    histMain,
    histIncoming,
    top,
    duplicateIncomingAndMain: histMain > 0 && histIncoming > 0,
    rawSnippet: d.slice(0, 4000),
  };
}

function readKeyguardLocked(serial) {
  const keyguard = adb(serial, "shell", "dumpsys", "keyguard");
  const window = adb(serial, "shell", "dumpsys", "window");
  const blob = `${keyguard}\n${window}`;
  const locked =
    /mShowingLockscreen=true|showing=true|isStatusBarKeyguard=true|mKeyguardShowing=true/.test(blob) &&
    !/mKeyguardShowing=false/.test(blob);
  return { locked, snippet: blob.slice(0, 800) };
}

async function ensureKeyguardUnlocked(serial, label = "device") {
  for (let attempt = 0; attempt < 5; attempt++) {
    adb(serial, "shell", "input", "keyevent", "224");
    adb(serial, "shell", "input", "keyevent", "82");
    adbObj(serial, "shell", "wm", "dismiss-keyguard");
    adb(serial, "shell", "input", "swipe", "540", "1800", "540", "400");
    adb(serial, "shell", "input", "keyevent", "3");
    await sleep(1500);
    const state = readKeyguardLocked(serial);
    console.log(`[v4-5gate] ${label} keyguard attempt=${attempt + 1} locked=${state.locked}`);
    if (!state.locked) return state;
  }
  return readKeyguardLocked(serial);
}

function screenshot(serial, name) {
  const p = path.join(OUT, name);
  adbObj(serial, "shell", "screencap", "-p", "/sdcard/qa-sc.png");
  adbObj(serial, "pull", "/sdcard/qa-sc.png", p);
  return fs.existsSync(p) ? p : null;
}

async function lockScreen(serial) {
  adb(serial, "shell", "input", "keyevent", "3");
  await sleep(800);
  adb(serial, "shell", "input", "keyevent", "26");
  await sleep(1500);
}

async function screenOff(serial) {
  adb(serial, "shell", "input", "keyevent", "26");
  await sleep(1200);
}

async function homeUnlocked(serial) {
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "input", "keyevent", "3");
  await sleep(1200);
}

/** G1 lock/FSI 후 잔여 수신 UI·알림·DB ringing 정리 — G2 background FCM flake 방지 */
async function resetCalleeDevice(
  serial,
  label = "callee",
  lastCallId = null,
  { aggressive = false, adbFn = null } = {},
) {
  await endActiveCalls();
  await ensureKeyguardUnlocked(serial, `${label}-reset`);
  if (lastCallId) {
    adbObj(
      serial,
      "shell",
      "am",
      "broadcast",
      "-a",
      "com.dibay.app.action.INCOMING_CALL_TERMINAL",
      "-p",
      PKG,
      "--es",
      "callId",
      lastCallId,
    );
    await sleep(1500);
  }
  adbObj(serial, "shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  const xml = adb(serial, "shell", "cat", "/sdcard/uidump.xml");
  const declineMatch = xml.match(
    /resource-id="com\.dibay\.app:id\/incoming_call_decline"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  );
  if (declineMatch) {
    const x = Math.floor((Number(declineMatch[1]) + Number(declineMatch[3])) / 2);
    const y = Math.floor((Number(declineMatch[2]) + Number(declineMatch[4])) / 2);
    adb(serial, "shell", "input", "tap", String(x), String(y));
    await sleep(2000);
  } else {
    adb(serial, "shell", "input", "keyevent", "4");
    await sleep(800);
  }
  adbObj(serial, "shell", "cmd", "notification", "cancel-all", PKG);
  adb(serial, "shell", "input", "keyevent", "3");
  const beforeWait = activityStack(serial);
  for (let i = 0; i < 8; i++) {
    const stack = activityStack(serial);
    if (stack.histIncoming === 0) break;
    await sleep(1500);
  }
  await sleep(3000);
  if (aggressive && adbFn) {
    adbObj(serial, "shell", "am", "force-stop", PKG);
    await sleep(1500);
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
      `${VERCEL}/philife`,
      "-p",
      PKG,
    );
    await sleep(6000);
    await refreshApkFcmRegisterTail({
      adb: adbFn,
      serial,
      pkg: PKG,
      act: ACT,
      prod: VERCEL,
      expectedUserId: USER_B,
      log: (m) => console.log(`[v4-5gate] ${m}`),
      label: `${label}-fcm`,
    });
    await sleep(2000);
  }
  const finalStack = activityStack(serial);
  const finalLogs = logcatFiltered(serial);
  console.log(
    `[v4-5gate] reset_done label=${label} histIncoming_before=${beforeWait.histIncoming} histIncoming_after=${finalStack.histIncoming} duplicateAfter=${finalStack.duplicateIncomingAndMain}`,
  );
  return { beforeWait, finalStack, finalLogs };
}

async function startRealFcmCall(adbFn) {
  adb(SERIAL_A, "shell", "input", "keyevent", "224");
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
    `${VERCEL}/community-messenger/rooms/${ROOM_ID}`,
    "-p",
    PKG,
  );
  await sleep(6000);
  forwardCdp(adbFn, SERIAL_A, 9223);
  const { browser, page } = await connectWebView(chromium, 9223);
  const result = await page.evaluate(async (roomId) => {
    const r = await fetch(`/api/community-messenger/rooms/${roomId}/calls`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callKind: "voice", dialIntent: "fresh" }),
    });
    const j = await r.json().catch(() => ({}));
    return {
      status: r.status,
      callId: String(j?.callId ?? j?.session?.id ?? "").trim(),
    };
  }, ROOM_ID);
  await browser.close().catch(() => {});
  adbObj(SERIAL_A, "forward", "--remove", "tcp:9223");
  console.log(`[v4-5gate] dial POST status=${result.status} callId=${result.callId || "?"}`);
  return result.callId;
}

function tapAccept(serial) {
  adbObj(serial, "shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  const xml = adb(serial, "shell", "cat", "/sdcard/uidump.xml");
  const re = new RegExp(
    `resource-id="${ACCEPT_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
  );
  const m = xml.match(re);
  if (!m) return { tapped: false };
  const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
  const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
  adb(serial, "shell", "input", "tap", String(x), String(y));
  return { tapped: true, x, y, bounds: `[${m[1]},${m[2]}][${m[3]},${m[4]}]`, method: "in_app_accept" };
}

function tapDeclineInApp(serial) {
  adbObj(serial, "shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  const xml = adb(serial, "shell", "cat", "/sdcard/uidump.xml");
  const re = new RegExp(
    `resource-id="${DECLINE_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
  );
  const m = xml.match(re);
  if (!m) return { tapped: false, method: "in_app_decline" };
  const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
  const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
  adb(serial, "shell", "input", "tap", String(x), String(y));
  return {
    tapped: true,
    x,
    y,
    bounds: `[${m[1]},${m[2]}][${m[3]},${m[4]}]`,
    method: "in_app_decline",
  };
}

async function tapFallbackNotificationDecline(serial) {
  adb(serial, "shell", "cmd", "statusbar", "expand-notifications");
  await sleep(1500);
  for (let i = 0; i < 3; i++) {
    const xml = dumpUi(serial);
    const found = findDeclineButtonInXml(xml);
    if (found) {
      adb(serial, "shell", "input", "tap", String(found.x), String(found.y));
      return {
        tapped: true,
        x: found.x,
        y: found.y,
        label: found.label,
        bounds: found.bounds,
        method: "uiautomator_expanded_decline",
      };
    }
    await sleep(400);
  }
  return { tapped: false, method: "uiautomator_expanded_decline" };
}

async function waitBetweenGatesIdle(serial, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await endActiveCalls();
    const stack = activityStack(serial);
    const logs = logcatFiltered(serial);
    const lines = logs.split("\n");
    const ringStartIdx = lines.findLastIndex?.((l) => l.includes("ringtone_start_native")) ??
      lines.map((l, i) => (l.includes("ringtone_start_native") ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
    const ringStopIdx = lines.findLastIndex?.((l) => l.includes("ringtone_stop_native")) ??
      lines.map((l, i) => (l.includes("ringtone_stop_native") ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
    const ringBalanced = ringStartIdx < 0 || ringStopIdx >= ringStartIdx;
    if (stack.histIncoming === 0 && ringBalanced) {
      return { ok: true, stack, ringBalanced };
    }
    adb(serial, "shell", "input", "keyevent", "3");
    await sleep(2500);
  }
  return { ok: false, stack: activityStack(serial) };
}

async function waitIncomingActionsReady(serial, callId, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = logcatFiltered(serial);
    const scoped = logs.split("\n").filter((l) => l.includes(callId));
    if (scoped.some((l) => l.includes("accept_button_rendered"))) {
      await sleep(800);
      return { ok: true, reason: "accept_button_rendered" };
    }
    if (extractMarkers(logs, callId).incoming_activity_shown) {
      await sleep(1500);
      return { ok: true, reason: "incoming_activity_shown_grace" };
    }
    if (scoped.some((l) => l.includes("native_notification_fallback"))) {
      return { ok: true, reason: "native_notification_fallback" };
    }
    await sleep(400);
  }
  return { ok: false, reason: "timeout" };
}

function callDeclineConfirmed(logText, callId) {
  const scoped = logText.split("\n").filter((l) => l.includes(callId));
  const m = extractMarkers(logText, callId);
  return (
    scoped.some((l) => l.includes("reject_clicked")) ||
    scoped.some((l) => l.includes("reject_start")) ||
    (m.ring_stop_count >= 1 && scoped.some((l) => l.includes("incoming_session_purged")))
  );
}

async function tapIncomingDecline(serial, callId, { fallbackSeen } = {}) {
  const attempts = [];
  for (let i = 0; i < 5; i++) {
    const tap = fallbackSeen
      ? await tapFallbackNotificationDecline(serial)
      : tapDeclineInApp(serial);
    attempts.push(tap);
    await sleep(2000);
    const logs = logcatFiltered(serial);
    if (callDeclineConfirmed(logs, callId)) {
      return { ...tap, tapped: tap.tapped || true, attempts, confirmed: true };
    }
    if (!fallbackSeen && i === 2) {
      const fb = await tapFallbackNotificationDecline(serial);
      attempts.push(fb);
      await sleep(2000);
      const logs2 = logcatFiltered(serial);
      if (callDeclineConfirmed(logs2, callId)) {
        return { ...fb, tapped: fb.tapped || true, attempts, confirmed: true };
      }
    }
  }
  const last = attempts[attempts.length - 1] ?? { tapped: false };
  return { ...last, attempts, confirmed: false };
}

async function waitOwnerCleared(serial, callId, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = logcatFiltered(serial);
    const m = extractMarkers(logs, callId);
    if (callDeclineConfirmed(logs, callId) && (m.owner_cleared || m.ring_stop_count >= 1)) {
      return { ok: true, markers: m };
    }
    await sleep(500);
  }
  return { ok: false, markers: extractMarkers(logcatFiltered(serial), callId) };
}

async function waitIncomingUi(serial, callId, timeoutMs = 55_000, { allowFsiAttached = true, allowStack = true } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = logcatFiltered(serial);
    const scopedLines = callId ? logs.split("\n").filter((l) => l.includes(callId)) : logs.split("\n");
    if (scopedLines.some((l) => /\bincoming_activity_shown callId=/.test(l))) {
      return { ok: true, reason: "incoming_activity_shown" };
    }
    if (scopedLines.some((l) => l.includes("native_notification_fallback"))) {
      return { ok: true, reason: "native_notification_fallback" };
    }
    if (allowStack) {
      const stack = activityStack(serial);
      if (stack.histIncoming > 0) {
        return { ok: true, reason: "incoming_activity_in_stack" };
      }
    }
    if (allowFsiAttached && scopedLines.some((l) => l.includes("fsi_attached"))) {
      return { ok: true, reason: "fsi_attached" };
    }
    await sleep(500);
  }
  return { ok: false, reason: "timeout" };
}

async function fetchVercelMeta() {
  const res = await fetch(VERCEL, { method: "HEAD", redirect: "follow" });
  return {
    url: VERCEL,
    status: res.status,
    vercelId: res.headers.get("x-vercel-id"),
    cache: res.headers.get("x-vercel-cache"),
  };
}

async function runGate(gateId, fn) {
  console.log(`\n[v4-5gate] === ${gateId} start ===`);
  const result = await fn();
  console.log(`[v4-5gate] ${gateId} verdict=${result.verdict}`);
  return result;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  loadEnvLocal();

  const nativeHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: ROOT }).stdout?.trim();
  const nativeShort = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", cwd: ROOT }).stdout?.trim();
  const dirty = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8", cwd: ROOT }).stdout?.trim();
  const apkPath = path.join(ROOT, "android/app/build/outputs/apk/debug/app-debug.apk");
  const apkSha = fs.existsSync(apkPath)
    ? spawnSync("shasum", ["-a", "256", apkPath], { encoding: "utf8" }).stdout?.split(" ")[0]
    : null;
  const vercelMeta = await fetchVercelMeta();

  const shaReport = {
    native_git_head: nativeHead,
    native_git_short: nativeShort,
    native_worktree_dirty: Boolean(dirty),
    native_apk_sha256: apkSha,
    native_policy_markers_expected: [
      "lock_incoming_fsi_only",
      "launch_unverified_fallback",
      "manual_start_activity=false",
    ],
    web_vercel_url: VERCEL,
    web_vercel_id: vercelMeta.vercelId,
    web_vercel_cache: vercelMeta.cache,
    sha_mismatch_note:
      "APK embeds uncommitted native Java (A/B/C Notifier). Vercel serves last git push — Web bundle may differ from local TS test/contract edits until push.",
  };
  fs.writeFileSync(path.join(OUT, "sha-report.json"), JSON.stringify(shaReport, null, 2));
  console.log("[v4-5gate] sha-report", JSON.stringify(shaReport, null, 2));

  const adbFn = (serial, ...args) => adbObj(serial, ...args);
  for (const serial of [SERIAL_A, SERIAL_B]) {
    for (const perm of ["android.permission.RECORD_AUDIO", "android.permission.POST_NOTIFICATIONS"]) {
      adb(serial, "shell", "pm", "grant", PKG, perm);
    }
    adb(serial, "shell", "cmd", "appops", "set", PKG, "USE_FULL_SCREEN_INTENT", "allow");
  }

  const loginA = await ensureApkWebViewLogin({
    adb: adbFn, chromium, serial: SERIAL_A, cdpPort: 9223, act: ACT, pkg: PKG, prod: VERCEL,
    login: "aaaa", expectedUserId: USER_A, loadEnv: loadEnvLocal, password: PASSWORD,
    log: (m) => console.log(`[v4-5gate] ${m}`), label: "A", restartForFcm: false,
  });
  const loginB = await ensureApkWebViewLogin({
    adb: adbFn, chromium, serial: SERIAL_B, cdpPort: 9224, act: ACT, pkg: PKG, prod: VERCEL,
    login: "qqqq", expectedUserId: USER_B, loadEnv: loadEnvLocal, password: PASSWORD,
    log: (m) => console.log(`[v4-5gate] ${m}`), label: "B", restartForFcm: false,
  });
  if (!loginA.ok || !loginB.ok) throw new Error("login failed");

  await refreshApkFcmRegisterTail({
    adb: adbFn, serial: SERIAL_B, pkg: PKG, act: ACT, prod: VERCEL, expectedUserId: USER_B,
    log: (m) => console.log(`[v4-5gate] ${m}`), label: "B",
  });

  const gates = {};
  const transitions = {};
  const onlyGates = (process.env.V4_5GATE_ONLY ?? "G1,G2,G3,G4,G5").split(",").map((s) => s.trim());
  const shouldRun = (id) => onlyGates.includes(id);

  // G1 — lock/sleep, real FCM, UI 1 + ring 1
  if (shouldRun("G1")) {
  gates.G1 = await runGate("G1_lock_sleep", async () => {
    await endActiveCalls();
    await sleep(2000);
    adb(SERIAL_A, "logcat", "-c");
    adb(SERIAL_B, "logcat", "-c");
    await lockScreen(SERIAL_B);
    const callId = await startRealFcmCall(adbFn);
    await waitIncomingUi(SERIAL_B, callId);
    await sleep(3000);
    const logs = logcatFiltered(SERIAL_B);
    const m = extractMarkers(logs, callId);
    const stack = activityStack(SERIAL_B);
    const shot = screenshot(SERIAL_B, "g1-lock-incoming.png");
    const pass =
      Boolean(callId) &&
      m.fcm_incoming &&
      m.lock_fsi_only &&
      m.fsi_attached &&
      m.fsi_attached_count === 1 &&
      !m.fsi_duplicate &&
      !m.native_activity_launch_start &&
      m.incoming_activity_shown &&
      m.ring_start_count >= 1 &&
      !m.missed_timeout;
    return { verdict: pass ? "PASS" : "FAIL", callId, markers: m, stack, screenshot: shot, logs };
  });
  if (shouldRun("G1") && shouldRun("G2")) {
    const debugAggressive = process.env.V4_DEBUG_AGGRESSIVE_RESET === "1";
    transitions.G1_to_G2_reset = await resetCalleeDevice(SERIAL_B, "G1→G2", gates.G1?.callId, {
      aggressive: debugAggressive,
      adbFn: debugAggressive ? adbFn : null,
    });
  }
  }

  // G2 — home background, UI 1, accept -> call screen
  if (shouldRun("G2")) {
  gates.G2 = await runGate("G2_background_accept", async () => {
    await resetCalleeDevice(SERIAL_B, "G2-prep");
    adb(SERIAL_A, "logcat", "-c");
    adb(SERIAL_B, "logcat", "-c");
    const keyguard = await ensureKeyguardUnlocked(SERIAL_B, "G2-B");
    if (keyguard.locked) {
      return {
        verdict: "FAIL",
        reason: "keyguard_still_locked_before_background_dial",
        keyguard,
      };
    }
    adb(SERIAL_B, "shell", "input", "keyevent", "3");
    await sleep(1200);
    const callId = await startRealFcmCall(adbFn);
    const incoming = await waitIncomingUi(SERIAL_B, callId, 55_000, {
      allowFsiAttached: false,
      allowStack: false,
    });
    if (!incoming.ok) {
      const logsEarly = logcatFiltered(SERIAL_B);
      return {
        verdict: "FAIL",
        reason: "incoming_ui_timeout",
        callId,
        incoming,
        keyguard,
        markers: extractMarkers(logsEarly, callId),
        logs: logsEarly,
      };
    }
    const preAcceptLogs = logcatFiltered(SERIAL_B);
    const fallbackSeen = {
      ok:
        incoming.reason === "native_notification_fallback" ||
        extractMarkers(preAcceptLogs, callId).native_notification_fallback,
      reason:
        incoming.reason === "native_notification_fallback" ||
        extractMarkers(preAcceptLogs, callId).native_notification_fallback
          ? "native_notification_fallback"
          : "activity_path",
    };
    const tap = fallbackSeen.ok ? await tapFallbackNotificationAccept(SERIAL_B) : tapAccept(SERIAL_B);
    const fallbackShot = screenshot(SERIAL_B, "g2-fallback-notification.png");
    const preTapButton = tap.bounds
      ? { label: tap.label, x: tap.x, y: tap.y, bounds: tap.bounds, method: tap.method }
      : null;
    if (!fallbackSeen.ok) await sleep(2000);
    const fallbackTapShot = screenshot(SERIAL_B, "g2-fallback-accept-tap.png");
    console.log(
      `[v4-5gate] g2_fallback_accept_tap callId=${callId} fallbackSeen=${fallbackSeen.ok} tapped=${tap.tapped} x=${tap.x ?? "-"} y=${tap.y ?? "-"} bounds=${tap.bounds ?? "-"} label=${tap.label ?? "-"} method=${tap.method ?? "-"}`,
    );
    await sleep(18_000);
    const logs = logcatFiltered(SERIAL_B);
    const m = extractMarkers(logs, callId);
    const acceptChain = fallbackSeen.ok ? extractAcceptChain(logs, callId) : null;
    const stack = activityStack(SERIAL_B);
    const shot = screenshot(SERIAL_B, "g2-after-accept.png");
    const pass = fallbackSeen.ok
      ? Boolean(callId) &&
        m.fcm_incoming &&
        m.keyguard_unlocked_in_fcm &&
        !m.lock_fsi_only &&
        m.native_activity_launch_start &&
        m.native_notification_fallback_count === 1 &&
        m.launch_unverified_fallback_count === 0 &&
        !m.launch_unverified_fallback &&
        m.fsi_attached_count <= 1 &&
        tap.tapped &&
        acceptChain &&
        fallbackAcceptChainComplete(acceptChain)
      : Boolean(callId) &&
        m.fcm_incoming &&
        m.keyguard_unlocked_in_fcm &&
        !m.lock_fsi_only &&
        m.native_activity_launch_start &&
        m.incoming_activity_shown &&
        !m.launch_unverified_fallback &&
        m.fsi_attached_count <= 1 &&
        tap.tapped &&
        (m.main_activity_v4_accept || m.screen_mounted) &&
        !m.missed_timeout;
    return {
      verdict: pass ? "PASS" : "FAIL",
      callId,
      keyguard,
      markers: m,
      acceptChain,
      tap,
      preTapButton,
      stack,
      screenshot: shot,
      incoming,
      fallbackSeen,
      fallbackNotificationScreenshot: fallbackShot,
      fallbackTapScreenshot: fallbackTapShot,
      preAcceptLogs,
      logs,
    };
  });
  }

  // G3 — lock incoming + launcher tap (duplicate stack check)
  if (shouldRun("G3")) {
  gates.G3 = await runGate("G3_lock_launcher_stack", async () => {
    await endActiveCalls();
    await sleep(2500);
    await resetCalleeDevice(SERIAL_B, "G3-prep");
    adb(SERIAL_B, "logcat", "-c");
    await lockScreen(SERIAL_B);
    const callId = await startRealFcmCall(adbFn);
    const incoming = await waitIncomingUi(SERIAL_B, callId);
    if (!incoming.ok || !callId) {
      return {
        verdict: "FAIL",
        reason: "incoming_ui_not_shown_before_launcher",
        callId,
        incoming,
      };
    }
    const preLauncherLogs = logcatFiltered(SERIAL_B);
    const preM = extractMarkers(preLauncherLogs, callId);
    if (!preM.incoming_activity_shown && !preM.fsi_attached) {
      return {
        verdict: "FAIL",
        reason: "incoming_activity_shown_missing_before_launcher",
        callId,
        incoming,
        markers: preM,
        preLauncherLogs,
      };
    }
    await sleep(1500);
    adbObj(SERIAL_B, "shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
    await sleep(4000);
    const stack = activityStack(SERIAL_B);
    const logs = logcatFiltered(SERIAL_B);
    const m = extractMarkers(logs, callId);
    const shot = screenshot(SERIAL_B, "g3-launcher-dup-check.png");
    const pass = !stack.duplicateIncomingAndMain && stack.histIncoming <= 1;
    return {
      verdict: pass ? "PASS" : "FAIL",
      callId,
      markers: m,
      stack,
      screenshot: shot,
      logs,
      note: pass ? "no Main+Incoming duplicate" : "MainActivity+IncomingCallActivity both present — task/launcher fix needed",
    };
  });
  }

  // G4 — accept then no missed_timeout within 35s
  if (shouldRun("G4")) {
  gates.G4 = await runGate("G4_accept_no_missed", async () => {
    await endActiveCalls();
    await sleep(2500);
    adb(SERIAL_B, "logcat", "-c");
    const keyguard = await ensureKeyguardUnlocked(SERIAL_B, "G4-B");
    if (keyguard.locked) {
      return { verdict: "FAIL", reason: "keyguard_still_locked", keyguard };
    }
    adb(SERIAL_B, "shell", "input", "keyevent", "3");
    await sleep(1200);
    const callId = await startRealFcmCall(adbFn);
    const incoming = await waitIncomingUi(SERIAL_B, callId, 55_000, {
      allowFsiAttached: false,
      allowStack: false,
    });
    if (!incoming.ok) {
      return { verdict: "FAIL", reason: "incoming_ui_timeout", callId, incoming, keyguard };
    }
    const preLogs = logcatFiltered(SERIAL_B);
    const fallbackSeen =
      incoming.reason === "native_notification_fallback" ||
      extractMarkers(preLogs, callId).native_notification_fallback;
    const tap = fallbackSeen ? await tapFallbackNotificationAccept(SERIAL_B) : tapAccept(SERIAL_B);
    await sleep(35_000);
    const logs = logcatFiltered(SERIAL_B);
    const m = extractMarkers(logs, callId);
    const acceptChain = fallbackSeen ? extractAcceptChain(logs, callId) : null;
    const pass = fallbackSeen
      ? Boolean(callId) &&
        tap.tapped &&
        acceptChain &&
        fallbackAcceptChainComplete(acceptChain) &&
        m.ring_stop_count >= 1
      : Boolean(callId) &&
        tap.tapped &&
        m.accept_start &&
        !m.missed_timeout &&
        m.ring_stop_count >= 1;
    if (pass && callId) {
      await endActiveCalls();
      await sleep(3000);
      await resetCalleeDevice(SERIAL_B, "G4-teardown", callId);
      await homeUnlocked(SERIAL_B);
      await sleep(3000);
    }
    return {
      verdict: pass ? "PASS" : "FAIL",
      callId,
      tap,
      incoming,
      fallbackSeen: { ok: fallbackSeen },
      acceptChain,
      keyguard,
      markers: m,
      logs,
    };
  });
  }

  // G5 — redial, owner cleanup
  if (shouldRun("G5")) {
  gates.G5 = await runGate("G5_redial_owner_cleanup", async () => {
    await endActiveCalls();
    await sleep(4000);
    adb(SERIAL_B, "logcat", "-c");
    await waitBetweenGatesIdle(SERIAL_B, 15_000);
    await resetCalleeDevice(SERIAL_B, "G5-prep");
    await homeUnlocked(SERIAL_B);
    adb(SERIAL_B, "logcat", "-c");
    await ensureKeyguardUnlocked(SERIAL_B, "G5-B");
    adb(SERIAL_B, "shell", "input", "keyevent", "3");
    await sleep(1200);
    const callId1 = await startRealFcmCall(adbFn);
    const incoming1 = await waitIncomingUi(SERIAL_B, callId1, 55_000);
    if (!incoming1.ok) {
      return { verdict: "FAIL", reason: "incoming1_timeout", callId1, incoming1 };
    }
    const preDeclineLogs = logcatFiltered(SERIAL_B);
    const fallback1 =
      incoming1.reason === "native_notification_fallback" ||
      extractMarkers(preDeclineLogs, callId1).native_notification_fallback;
    await waitIncomingActionsReady(SERIAL_B, callId1);
    const declineTap = await tapIncomingDecline(SERIAL_B, callId1, { fallbackSeen: fallback1 });
    const ownerWait = await waitOwnerCleared(SERIAL_B, callId1);
    const logsAfterFirst = logcatFiltered(SERIAL_B);
    const mFirst = extractMarkers(logsAfterFirst, callId1);
    await resetCalleeDevice(SERIAL_B, "G5-between", callId1);
    await homeUnlocked(SERIAL_B);
    adb(SERIAL_B, "logcat", "-c");
    await sleep(1500);
    const callId2 = await startRealFcmCall(adbFn);
    const incoming2 = await waitIncomingUi(SERIAL_B, callId2, 55_000, {
      allowFsiAttached: true,
      allowStack: false,
    });
    await sleep(3000);
    const logs2 = logcatFiltered(SERIAL_B);
    const m2 = extractMarkers(logs2, callId2);
    const blockedDuplicate = logs2.split("\n").some(
      (l) => l.includes(callId2) && l.includes("fcm_duplicate_incoming_blocked"),
    );
    const pass =
      callId2 &&
      callId1 &&
      callId2 !== callId1 &&
      declineTap.confirmed &&
      ownerWait.ok &&
      (ownerWait.markers?.owner_cleared || callDeclineConfirmed(logsAfterFirst, callId1)) &&
      !blockedDuplicate &&
      incoming2.ok &&
      m2.fcm_incoming &&
      (m2.incoming_activity_shown ||
        m2.fsi_attached ||
        m2.native_activity_launch_start ||
        m2.native_notification_fallback);
    return {
      verdict: pass ? "PASS" : "FAIL",
      callId1,
      callId2,
      incoming1,
      incoming2,
      declineTap,
      ownerWait,
      markersFirst: mFirst,
      markersSecond: m2,
      logsAfterFirst,
      logs2,
    };
  });
  }

  const overallPass = Object.values(gates).every((g) => g.verdict === "PASS");
  const report = {
    verdict: overallPass ? "PASS" : "FAIL",
    completedAt: new Date().toISOString(),
    devices: { A: SERIAL_A, B: SERIAL_B },
    sha: shaReport,
    transitions,
    gates,
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("\n[v4-5gate] FINAL", JSON.stringify({ verdict: report.verdict, gates: Object.fromEntries(Object.entries(gates).map(([k, v]) => [k, v.verdict])) }, null, 2));
  process.exit(overallPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
