#!/usr/bin/env node
/**
 * O3 Connected device QA — product code NO CHANGES.
 * Runs 4 mandatory scenarios and judges O3 PASS/FAIL from logcat.
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
  probeApkUser,
} from "../scripts/qa/lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, ".qa-logs", "o3-connected-device-qa");
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
const ACCEPT_ID = "com.dibay.app:id/incoming_call_accept";
const VOICE_NATIVE_END_ID = "native_voice_call_end";

const NATIVE_PASS = ["state_connected", "native_connected_emit", "active_call_connected"];
const WEB_PASS = [
  "native_connected_received",
  "native_connected_store_hydrate",
  "native_connected_ops_start",
  "call_heartbeat_watchdog_start",
  "remote_terminal_watch_start",
  "native_connected_ops_done",
];
const FORBIDDEN = [
  "route_to_screen",
  "outgoing_ringing",
  "screen_mounted",
  "agora_join_success",
  "markCallV4MediaConnected",
];
const VOICE_PRODUCT_CLEANUP = [
  "native_end_dispatch",
  "runtime_cleanup_start",
  "agora_native_disconnected",
  "native_call_service_stop",
  "cleanup_done",
];
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

function lineHasCallId(line, callId) {
  if (!callId) return false;
  if (line.includes(callId)) return true;
  const compact = callId.replace(/-/g, "");
  return compact.length >= 8 && line.includes(compact);
}

function splitLogLines(logs) {
  return logs.split("\n").filter(Boolean);
}

/** Capacitor console logs payload objects as `[object Object]` without callId — scope to post-emit window. */
function findNativeConnectedWindow(lines, callId) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("native_connected_emit") && lineHasCallId(lines[i], callId)) {
      start = i;
      break;
    }
  }
  if (start < 0) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("state_connected") && lineHasCallId(lines[i], callId)) {
        start = i;
        break;
      }
    }
  }
  if (start < 0) return null;
  let end = Math.min(lines.length, start + 160);
  for (let i = start + 1; i < lines.length && i < start + 160; i++) {
    if (lines[i].includes("native_connected_ops_done") && lines[i].includes("DIBAY_WebView")) {
      end = Math.max(end, i + 1);
      break;
    }
  }
  return { start, end };
}

function countMarker(logs, marker, callId) {
  return splitLogLines(logs).filter((l) => l.includes(marker) && (!callId || lineHasCallId(l, callId))).length;
}

function countWebMarker(logs, marker, callId) {
  const lines = splitLogLines(logs);
  const window = callId ? findNativeConnectedWindow(lines, callId) : null;
  if (!window) return 0;

  let count = 0;
  for (let i = window.start; i < window.end; i++) {
    const l = lines[i];
    if (!l.includes(marker)) continue;
    if (!l.includes("DIBAY_WebView")) continue;
    if (lineHasCallId(l, callId)) {
      count++;
      continue;
    }
    if (l.includes("[object Object]") || l.includes("[DIBAY_CALL_V4]")) {
      count++;
    }
  }
  return count;
}

function countCallForegroundStart(logs, callId) {
  return logs.split("\n").filter((l) => {
    if (!lineHasCallId(l, callId)) return false;
    return (
      l.includes("CallForegroundService") &&
      (l.includes("start") || l.includes("call_service_start") || l.includes("FGS"))
    );
  }).length;
}

function analyze(logs, callId, { expectWeb = true } = {}) {
  const lines = splitLogLines(logs);
  const webWindow = callId ? findNativeConnectedWindow(lines, callId) : null;
  const nativePass = Object.fromEntries(NATIVE_PASS.map((m) => [m, countMarker(logs, m, callId)]));
  const webPass = Object.fromEntries(WEB_PASS.map((m) => [m, countWebMarker(logs, m, callId)]));
  const forbidden = Object.fromEntries(FORBIDDEN.map((m) => [m, countMarker(logs, m, callId)]));
  const callFgStart = countCallForegroundStart(logs, callId);
  const nativeOk = NATIVE_PASS.every((m) => nativePass[m] >= 1);
  const webOk = !expectWeb || WEB_PASS.every((m) => webPass[m] >= 1);
  const forbiddenOk =
    FORBIDDEN.every((m) => forbidden[m] === 0) &&
    callFgStart === 0 &&
    countMarker(logs, "agora_join_success", callId) === 0;
  return {
    webWindow,
    nativePass,
    webPass,
    forbidden: { ...forbidden, CallForegroundService_start: callFgStart },
    nativeOk,
    webOk,
    forbiddenOk,
    qaPass: nativeOk && webOk && forbiddenOk,
  };
}

async function prodFetch(pathname, auth, init = {}) {
  loadEnvLocal();
  const res = await fetch(`${WEB}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie: auth.cookie,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text: text.slice(0, 400) };
}

async function buildAuth(login, expectedUserId) {
  const { cookies, userId } = await buildApkSessionCookies({
    login,
    prod: WEB,
    password: PASSWORD,
    loadEnv: loadEnvLocal,
  });
  if (userId !== expectedUserId) throw new Error(`auth_mismatch_${login}`);
  return { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "), userId };
}

async function apiDial(callKind) {
  const auth = await buildAuth("aaaa", USER_A);
  const res = await prodFetch(`/api/community-messenger/rooms/${ROOM_ID}/calls`, auth, {
    method: "POST",
    body: JSON.stringify({ callKind, dialIntent: "fresh" }),
  });
  const callId = res.json?.callId ?? "";
  return { ok: res.status === 200 && Boolean(callId), callId, status: res.status, callKind };
}

async function scenarioCleanupOnly() {
  const results = [];
  for (const [login, userId] of [
    ["aaaa", USER_A],
    ["qqqq", USER_B],
  ]) {
    try {
      const auth = await buildAuth(login, userId);
      const result = await prodFetch("/api/community-messenger/calls/active/end-all", auth, {
        method: "POST",
        body: "{}",
      });
      results.push({
        login,
        status: result.status,
        note: "scenario_cleanup_only_not_product_proof",
      });
    } catch (error) {
      results.push({
        login,
        status: 0,
        error: String(error),
        note: "scenario_cleanup_only_not_product_proof",
      });
    }
  }
  return results;
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

function clearAndDump(serial) {
  adb(serial, "logcat", "-c");
}

function dumpUiXml(serial) {
  adbObj(serial, "shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  return adb(serial, "shell", "cat", "/sdcard/uidump.xml");
}

function tapCoords(serial, x, y) {
  adb(serial, "shell", "input", "tap", String(x), String(y));
}

function parseAcceptBoundsFromLogcat(logs, callId) {
  const lines = splitLogLines(logs);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l.includes("accept_button_bounds") || !lineHasCallId(l, callId)) continue;
    const m = l.match(/left=(\d+)\s+top=(\d+)\s+right=(\d+)\s+bottom=(\d+)/);
    if (!m) continue;
    return {
      tapped: true,
      method: "logcat_accept_button_bounds",
      x: Math.floor((Number(m[1]) + Number(m[3])) / 2),
      y: Math.floor((Number(m[2]) + Number(m[4])) / 2),
    };
  }
  return null;
}

function tapNotificationAccept(serial) {
  adb(serial, "shell", "cmd", "statusbar", "expand-notifications");
  const xml = dumpUiXml(serial);
  const patterns = [
    /content-desc="[^"]*(?:수락|Accept|Answer)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
    /text="[^"]*(?:수락|Accept|Answer)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (!m) continue;
    const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
    const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
    tapCoords(serial, x, y);
    return { tapped: true, method: "notification_shade", x, y };
  }
  return { tapped: false, method: "notification_shade" };
}

function tapAccept(serial, logs = "", callId = "") {
  const fromLogcat = callId ? parseAcceptBoundsFromLogcat(logs, callId) : null;
  if (fromLogcat) {
    tapCoords(serial, fromLogcat.x, fromLogcat.y);
    return fromLogcat;
  }

  const xml = dumpUiXml(serial);
  const patterns = [
    new RegExp(
      `resource-id="${ACCEPT_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
    ),
    new RegExp(
      `${ACCEPT_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
    ),
    /content-desc="[^"]*(?:수락|Accept|Answer)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
    /text="[^"]*(?:수락|Accept|Answer)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (!m) continue;
    const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
    const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
    tapCoords(serial, x, y);
    return { tapped: true, method: "uiautomator", x, y };
  }

  return tapNotificationAccept(serial);
}

function wakeDevice(serial) {
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "input", "keyevent", "82");
}

async function prepareCalleeForIncoming() {
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
  await sleep(4000);
  adb(SERIAL_B, "shell", "input", "keyevent", "3");
  await sleep(1500);
}

async function waitIncomingOnCallee(callId, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = readLogcat(SERIAL_B);
    if (countMarker(logs, "incoming_activity_shown", callId) >= 1) {
      return { ok: true, via: "incoming_activity_shown", logs };
    }
    if (countMarker(logs, "incoming_fcm_received", callId) >= 1) {
      return { ok: true, via: "incoming_fcm_received", logs };
    }
    if (countMarker(logs, "ring_start", callId) >= 1) {
      return { ok: true, via: "ring_start", logs };
    }
    await sleep(500);
  }
  return { ok: false, logs: readLogcat(SERIAL_B) };
}

async function cdpPage(serial, port, fn) {
  forwardCdp(adbObj, serial, port);
  const { browser, page } = await connectWebView(chromium, port);
  try {
    return await fn(page);
  } finally {
    await browser.close().catch(() => {});
    adbObj(serial, "forward", "--remove", `tcp:${port}`);
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

async function waitForRoomComposerReady(page, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => {
      const hrefOk = location.href.includes("/rooms/");
      const voice = document.querySelector(
        'button[aria-label="음성 통화"], button[aria-label="Voice call"]',
      );
      const menu = document.querySelector(
        'button[aria-label="채팅방 메뉴"], button[aria-label="Chat room menu"]',
      );
      return {
        hrefOk,
        voice: voice instanceof HTMLButtonElement,
        menu: menu instanceof HTMLButtonElement,
      };
    });
    if (ready.hrefOk && (ready.voice || ready.menu)) return { ok: true, ...ready };
    await sleep(800);
  }
  return { ok: false, reason: "room_composer_not_ready" };
}

async function clickOutgoingButton(page, media) {
  return page.evaluate((kind) => {
    const voiceLabels = ["음성 통화", "Voice call"];
    const videoLabels = ["영상 통화", "Video call", "Video Call"];
    const labels = kind === "video" ? videoLabels : voiceLabels;

    for (const label of labels) {
      const ariaBtn = document.querySelector(`button[aria-label="${label}"]`);
      if (ariaBtn instanceof HTMLElement && !ariaBtn.disabled) {
        ariaBtn.click();
        return { ok: true, via: `aria:${label}` };
      }
    }

    const textBtn = [...document.querySelectorAll("button")].find((b) => {
      const text = (b.textContent ?? "").trim();
      return labels.some((label) => text === label || new RegExp(`^${label}$`, "i").test(text));
    });
    if (textBtn instanceof HTMLElement && !textBtn.disabled) {
      textBtn.click();
      return { ok: true, via: `text:${(textBtn.textContent ?? "").trim()}` };
    }
    return { ok: false, reason: "button_missing" };
  }, media);
}

function tapByPatterns(serial, patterns) {
  const xml = dumpUiXml(serial);
  for (const re of patterns) {
    const m = xml.match(re);
    if (!m) continue;
    const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
    const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
    if (x <= 1 && y <= 1) continue;
    if (Number(m[3]) - Number(m[1]) < 8 || Number(m[4]) - Number(m[2]) < 8) continue;
    tapCoords(serial, x, y);
    return { ok: true, x, y, pattern: re.source };
  }
  return { ok: false };
}

function tapByResourceId(serial, resourceSuffix) {
  const rid = `${PKG}:id/${resourceSuffix}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tapByPatterns(serial, [
    new RegExp(`resource-id="${rid}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`),
  ]);
}

async function ensureNativeVoiceForeground(serial, callId, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    adbObj(
      serial,
      "shell",
      "am",
      "start",
      "-n",
      `${PKG}/.nativevoice.NativeVoiceCallActivity`,
      "--es",
      "callId",
      callId,
      "--es",
      "uiMode",
      "outgoing",
      "-f",
      "0x24000000",
    );
    await sleep(1200);
    const xml = dumpUiXml(serial);
    if (xml.includes("native_voice_call_root")) return { ok: true };
    await sleep(500);
  }
  return { ok: false };
}

function tapNativeVoiceEnd(serial) {
  const byId = tapByResourceId(serial, VOICE_NATIVE_END_ID);
  if (byId.ok) return byId;
  return tapByPatterns(serial, [
    /text="종료"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /text="취소"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  ]);
}

async function waitVoiceProductCleanup(serial, callId, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = readLogcat(serial);
    const entry = hasVoiceProductEndEntry(logs, callId);
    const observed = Object.fromEntries(
      VOICE_PRODUCT_CLEANUP.map((marker) => [marker, countMarker(logs, marker, callId) >= 1]),
    );
    if (entry.ok && VOICE_PRODUCT_CLEANUP.every((marker) => observed[marker])) {
      return { ok: true, observed, entry: entry.via };
    }
    await sleep(500);
  }
  const logs = readLogcat(serial);
  return {
    ok: false,
    observed: Object.fromEntries(
      VOICE_PRODUCT_CLEANUP.map((marker) => [marker, countMarker(logs, marker, callId) >= 1]),
    ),
    entry: hasVoiceProductEndEntry(logs, callId).via ?? "missing",
  };
}

function hasVoiceProductEndEntry(logs, callId) {
  if (countMarker(logs, "end_tapped", callId) >= 1) return { ok: true, via: "end_tapped" };
  if (logs.includes("NativeCallService.endCall")) return { ok: true, via: "NativeCallService.endCall" };
  return { ok: false, via: "missing" };
}

async function clickWebProductEnd(serial, port, callId) {
  adbObj(serial, "shell", "am", "start", "-n", ACT);
  await sleep(1000);
  return cdpPage(serial, port, async (page) => {
    const result = await page.evaluate((sid) => {
      const reveal = document.querySelector('button[aria-label*="컨트롤"], button[aria-label*="controls"]');
      if (reveal instanceof HTMLElement) reveal.click();
      const buttons = [...document.querySelectorAll("button")];
      const endRe = /통화 종료|종료|end call|hang up|decline/i;
      const target = buttons.find((button) => {
        if (button.disabled) return false;
        const text = (button.textContent ?? "").replace(/\s+/g, " ").trim();
        const aria = button.getAttribute("aria-label") ?? "";
        const testId = button.getAttribute("data-testid") ?? "";
        return endRe.test(`${text} ${aria} ${testId}`);
      });
      if (target instanceof HTMLElement) {
        target.click();
        return {
          ok: true,
          via: target.getAttribute("data-testid") || target.getAttribute("aria-label") || target.textContent || "button",
          href: location.href,
          callId: sid,
        };
      }
      return { ok: false, reason: "end_button_not_found", href: location.href };
    }, callId);
    if (result.ok) return result;
    const xml = dumpUiXml(serial);
    const patterns = [
      /content-desc="[^"]*(?:종료|End|Hang up)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
      /text="[^"]*(?:종료|End|Hang up)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
    ];
    for (const re of patterns) {
      const m = xml.match(re);
      if (!m) continue;
      const x = Math.floor((Number(m[1]) + Number(m[3])) / 2);
      const y = Math.floor((Number(m[2]) + Number(m[4])) / 2);
      tapCoords(serial, x, y);
      return { ok: true, via: "uiautomator", x, y, href: result.href, callId };
    }
    return result;
  });
}

/** Product path: native Voice UI end -> Runtime cleanup (not end-all). */
async function dispatchNativeVoiceProductEnd(serial, callId) {
  adbObj(
    serial,
    "shell",
    "am",
    "broadcast",
    "-a",
    "com.dibay.app.nativevoice.END",
    "-n",
    `${PKG}/.nativevoice.NativeVoiceCallActionReceiver`,
    "--es",
    "callId",
    callId,
  );
}

async function productEndNativeVoice(serial, callId) {
  wakeDevice(serial);
  adbObj(
    serial,
    "shell",
    "am",
    "start",
    "-n",
    `${PKG}/.nativevoice.NativeVoiceCallActivity`,
    "--es",
    "callId",
    callId,
    "--es",
    "uiMode",
    "outgoing",
    "-f",
    "0x24000000",
  );
  await sleep(900);
  const foreground = { ok: dumpUiXml(serial).includes("native_voice_call_root") };
  const endTap = foreground.ok ? tapNativeVoiceEnd(serial) : { ok: false };
  await sleep(500);
  let entry = hasVoiceProductEndEntry(readLogcat(serial), callId);
  let endVia = entry.ok ? entry.via : endTap.ok ? "native_voice_ui_end_button" : "pending";

  if (!entry.ok) {
    dispatchNativeVoiceProductEnd(serial, callId);
    await sleep(800);
    entry = hasVoiceProductEndEntry(readLogcat(serial), callId);
    if (entry.ok) endVia = entry.via;
  }

  let webEnd = null;
  if (!entry.ok) {
    webEnd = await clickWebProductEnd(serial, CDP_A, callId);
    await sleep(1200);
    entry = hasVoiceProductEndEntry(readLogcat(serial), callId);
    if (entry.ok) endVia = entry.via;
    else if (webEnd.ok) endVia = "webview_call_screen_product_end";
  }

  const chain = entry.ok ? await waitVoiceProductCleanup(serial, callId) : { ok: false, observed: {}, entry: "missing" };
  return {
    ok: entry.ok && chain.ok,
    path: endVia,
    foreground,
    endTap,
    webEnd,
    entry: entry.via ?? "missing",
    chain: chain.observed,
  };
}

async function waitVoiceEngineReleased(serial, callId, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = readLogcat(serial);
    const cleanupDone = countMarker(logs, "cleanup_done", callId) >= 1;
    const busyForVoice = logs
      .split("\n")
      .some((line) => line.includes("native_engine_busy") && line.includes(`live_voice_session=${callId}`));
    if (cleanupDone && !busyForVoice) {
      return { ok: true, cleanupDone: true, busyForVoice: false };
    }
    await sleep(500);
  }
  const logs = readLogcat(serial);
  return {
    ok: false,
    cleanupDone: countMarker(logs, "cleanup_done", callId) >= 1,
    busyForVoice: logs
      .split("\n")
      .some((line) => line.includes("native_engine_busy") && line.includes(`live_voice_session=${callId}`)),
  };
}

async function forceStopApps() {
  for (const serial of [SERIAL_A, SERIAL_B]) {
    adbObj(serial, "shell", "am", "force-stop", PKG);
  }
}

async function settleBetweenScenarios({ skipEndAll = false } = {}) {
  if (!skipEndAll) {
    await scenarioCleanupOnly();
    await sleep(8000);
    await forceStopApps();
    await sleep(2500);
  } else {
    await sleep(2000);
  }
  adbObj(SERIAL_A, "shell", "am", "start", "-n", ACT);
  await sleep(1500);
  await prepareCalleeForIncoming();
}

async function settleVoiceToVideoHandoff(voiceResult) {
  await sleep(1500);
  adbObj(SERIAL_A, "shell", "am", "start", "-n", ACT);
  await sleep(1500);
  if (voiceResult?.verdict !== "PASS" || !voiceResult?.callId) {
    return { ok: false, reason: "voice_scenario_not_pass" };
  }
  if (voiceResult.voiceProductCleanup?.ok) {
    const release = await waitVoiceEngineReleased(SERIAL_A, voiceResult.callId);
    return { ok: release.ok, via: "voice_product_cleanup_done", release, voiceProductCleanup: voiceResult.voiceProductCleanup };
  }
  const cleanup = await productEndNativeVoice(SERIAL_A, voiceResult.callId);
  const release = cleanup.ok ? await waitVoiceEngineReleased(SERIAL_A, voiceResult.callId) : { ok: false };
  return {
    ok: cleanup.ok && release.ok,
    via: "native_voice_ui_product_end_retry",
    voiceProductCleanup: cleanup,
    release,
  };
}

async function waitCallIdle(serial, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tail = readLogcat(serial).split("\n").slice(-120).join("\n");
    const busy =
      /active_call_phase CONNECTED|state_connected callId=|ring_start callId=|caller_outgoing_start callId=/.test(
        tail,
      );
    if (!busy) return { ok: true };
    await sleep(1000);
  }
  return { ok: false };
}

async function openRoomDotMenu(page) {
  const headerMenu = await page.evaluate(() => {
    for (const label of ["채팅방 메뉴", "Chat room menu"]) {
      const btn = document.querySelector(`button[aria-label="${label}"]`);
      if (btn instanceof HTMLElement && !btn.disabled) {
        btn.click();
        return { ok: true, via: `header:${label}` };
      }
    }
    return { ok: false, reason: "header_menu_not_found" };
  });
  if (headerMenu.ok) return headerMenu;

  const plusOpened = await page.evaluate(() => {
    const plus = document.querySelector("[data-cm-line-plus-btn]");
    if (!(plus instanceof HTMLButtonElement) || plus.disabled) {
      return { ok: false, reason: "composer_plus_not_found" };
    }
    plus.click();
    return { ok: true, via: "composer_plus" };
  });
  if (!plusOpened.ok) return plusOpened;
  await sleep(1200);

  const viaAttachHint = await page.evaluate(() => {
    const hint = [...document.querySelectorAll("button")].find((b) =>
      /미디어·파일|media files|room info|사진·파일/i.test(b.textContent ?? ""),
    );
    if (hint instanceof HTMLElement) {
      hint.click();
      return { ok: true, via: "attach_hint" };
    }
    return { ok: false, reason: "attach_hint_not_found" };
  });
  if (!viaAttachHint.ok) return viaAttachHint;
  await sleep(1200);
  return { ok: true, via: "composer_plus_menu" };
}

async function uiOutgoingDial(media) {
  return cdpPage(SERIAL_A, CDP_A, async (page) => {
    const { cookies } = await buildApkSessionCookies({
      login: "aaaa",
      prod: WEB,
      password: PASSWORD,
      loadEnv: loadEnvLocal,
    });
    await page.context().addCookies(cookies);
    await navigateApkWebView(page, `${WEB}/community-messenger/rooms/${ROOM_ID}`, 10000);
    const roomReady = await waitForRoomComposerReady(page);
    if (!roomReady.ok) return { ok: false, reason: roomReady.reason ?? "room_not_ready", roomReady };
    await sleep(1000);

    let click = await clickOutgoingButton(page, media);
    if (!click.ok && media === "video") {
      const menu = await openRoomDotMenu(page);
      if (menu.ok) {
        await sleep(1200);
        click = await clickOutgoingButton(page, media);
      }
      if (!click.ok) return { ok: false, reason: click.reason ?? "video_button_missing", menu, roomReady };
    }
    if (!click.ok) return { ok: false, reason: click.reason ?? "button_missing", roomReady };

    await handleCallPermissionModal(page, { preferAllow: true });
    await sleep(3000);
    await handleCallPermissionModal(page, { preferAllow: true });
    adbObj(SERIAL_A, "shell", "am", "start", "-n", ACT);
    await sleep(1500);
    return { ok: true, via: click.via, href: await page.evaluate(() => location.href), roomReady };
  });
}

async function waitNativeConnected(getLogs, callId, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = getLogs();
    if (countMarker(logs, "native_connected_emit", callId) >= 1 && countMarker(logs, "state_connected", callId) >= 1) {
      return { ok: true, logs };
    }
    await sleep(500);
  }
  return { ok: false, logs: getLogs() };
}

async function ensureLogin() {
  grantPerms(SERIAL_A);
  grantPerms(SERIAL_B);
  for (const [serial, login, userId, port, label] of [
    [SERIAL_A, "aaaa", USER_A, CDP_A, "A"],
    [SERIAL_B, "qqqq", USER_B, CDP_B, "B"],
  ]) {
    const r = await ensureApkWebViewLogin({
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
      log: (m) => console.log(`[o3-qa] ${label} ${m}`),
      label,
      restartForFcm: false,
    });
    if (!r.ok) throw new Error(`login_${label}_fail`);
  }
  adbObj(SERIAL_A, "shell", "am", "start", "-n", ACT);
  await sleep(1500);
}

async function runIncoming(kind) {
  const name = kind === "video" ? "native_video_incoming" : "native_voice_incoming";
  clearAndDump(SERIAL_A);
  clearAndDump(SERIAL_B);
  await prepareCalleeForIncoming();
  wakeDevice(SERIAL_B);
  const dial = await apiDial(kind);
  if (!dial.ok) return { scenario: name, verdict: "FAIL", stage: "dial", dial };

  const incoming = await waitIncomingOnCallee(dial.callId);
  if (!incoming.ok) {
    return {
      scenario: name,
      callId: dial.callId,
      dial,
      verdict: "FAIL",
      stage: "incoming_wait",
      incoming,
    };
  }

  wakeDevice(SERIAL_B);
  let tapResult = { tapped: false, method: "none" };
  for (let i = 0; i < 12; i++) {
    const mergedLogs = `${readLogcat(SERIAL_A)}\n${readLogcat(SERIAL_B)}`;
    const readyForCall =
      countMarker(mergedLogs, "incoming_activity_shown", dial.callId) >= 1 ||
      countMarker(mergedLogs, "incoming_fcm_received", dial.callId) >= 1;
    if (!readyForCall) {
      await sleep(1000);
      continue;
    }
    tapResult = tapAccept(SERIAL_B, mergedLogs, dial.callId);
    if (tapResult.tapped) break;
    wakeDevice(SERIAL_B);
    await sleep(1200);
  }

  const wait = await waitNativeConnected(
    () => `${readLogcat(SERIAL_A)}\n${readLogcat(SERIAL_B)}`,
    dial.callId,
  );
  await sleep(4000);
  const logs = `${readLogcat(SERIAL_A)}\n${readLogcat(SERIAL_B)}`;
  const analysis = analyze(logs, dial.callId, { expectWeb: true });
  return {
    scenario: name,
    callId: dial.callId,
    dial,
    incoming,
    acceptTap: tapResult,
    acceptTapped: tapResult.tapped,
    connectedWait: wait.ok,
    verdict: analysis.qaPass && tapResult.tapped ? "PASS" : "FAIL",
    ...analysis,
    logPath: path.join(OUT, `logcat-${name}-${dial.callId}.txt`),
  };
}

async function runOutgoing(kind, { priorVoiceCallId = "", voiceHandoffReady = true } = {}) {
  const name = kind === "video" ? "o2_video_outgoing" : "o2_voice_outgoing";
  if (kind === "video") {
    if (!voiceHandoffReady) {
      return {
        scenario: name,
        verdict: "FAIL",
        stage: "voice_product_cleanup_prereq",
        priorVoiceCallId,
        voiceHandoffReady: false,
      };
    }
    if (priorVoiceCallId) {
      const release = await waitVoiceEngineReleased(SERIAL_A, priorVoiceCallId);
      if (!release.ok) {
        return {
          scenario: name,
          verdict: "FAIL",
          stage: "voice_engine_not_released",
          priorVoiceCallId,
          release,
        };
      }
    }
  }
  clearAndDump(SERIAL_A);
  clearAndDump(SERIAL_B);
  adbObj(SERIAL_A, "shell", "am", "start", "-n", ACT);
  await sleep(2000);
  const dial = await uiOutgoingDial(kind);
  if (!dial.ok) return { scenario: name, verdict: "FAIL", stage: "ui_dial", dial };
  let callId = null;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const logs = `${readLogcat(SERIAL_A)}\n${readLogcat(SERIAL_B)}`;
    const m =
      logs.match(/caller_outgoing_start callId=([0-9a-f-]{36})/i) ??
      logs.match(/session_created callId=([0-9a-f-]{36})/i);
    if (m) {
      callId = m[1];
      break;
    }
    await sleep(500);
  }
  if (!callId) {
    const logs = readLogcat(SERIAL_A);
    return { scenario: name, verdict: "FAIL", stage: "callId_not_found", dial, logsSnippet: logs.slice(-2000) };
  }
  await waitNativeConnected(() => readLogcat(SERIAL_A), callId);
  await sleep(2000);
  const logs = `${readLogcat(SERIAL_A)}\n${readLogcat(SERIAL_B)}`;
  const analysis = analyze(logs, callId, { expectWeb: true });
  let voiceProductCleanup = null;
  if (kind === "voice" && analysis.qaPass) {
    voiceProductCleanup = await productEndNativeVoice(SERIAL_A, callId);
  }
  return {
    scenario: name,
    callId,
    dial,
    verdict: analysis.qaPass ? "PASS" : "FAIL",
    voiceProductCleanup,
    ...analysis,
    logPath: path.join(OUT, `logcat-${name}-${callId}.txt`),
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  loadEnvLocal();
  console.log(`[o3-qa] devices A=${SERIAL_A} B=${SERIAL_B} web=${WEB}`);

  if (process.env.O3_VIDEO_OUTGOING_ONLY === "1") {
    await scenarioCleanupOnly();
    await sleep(1500);
    await forceStopApps();
    await sleep(4000);
    await ensureLogin();
    await settleBetweenScenarios();
    const r = await runOutgoing("video", { priorVoiceCallId: "", voiceHandoffReady: true });
    if (r.logPath) fs.writeFileSync(r.logPath, readLogcat(SERIAL_A) + "\n" + readLogcat(SERIAL_B));
    const report = {
      at: new Date().toISOString(),
      serialA: SERIAL_A,
      serialB: SERIAL_B,
      mode: "o2_video_outgoing_only",
      harness: {
        voiceToVideoHandoff: "skipped_standalone_video_outgoing",
        endAllUsage: "scenario_cleanup_only_not_product_proof",
      },
      results: [r],
      overallPass: r.verdict === "PASS",
    };
    fs.writeFileSync(path.join(OUT, "report-video-outgoing-only.json"), JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify(
        { mode: report.mode, overallPass: report.overallPass, scenario: r.scenario, callId: r.callId, verdict: r.verdict },
        null,
        2,
      ),
    );
    await scenarioCleanupOnly();
    process.exit(report.overallPass ? 0 : 1);
  }

  await scenarioCleanupOnly();
  await sleep(1500);
  await forceStopApps();
  await sleep(4000);
  await ensureLogin();

  const scenarioPlan = [
    { key: "o2_voice_outgoing", run: () => runOutgoing("voice") },
    { key: "o2_video_outgoing", run: (ctx) => runOutgoing("video", ctx) },
    { key: "native_voice_incoming", run: () => runIncoming("voice") },
    { key: "native_video_incoming", run: () => runIncoming("video") },
  ];

  const results = [];
  let voiceHandoff = { ok: true, priorVoiceCallId: "" };

  for (let i = 0; i < scenarioPlan.length; i++) {
    const step = scenarioPlan[i];
    if (i === 0) {
      await settleBetweenScenarios();
    } else if (step.key === "o2_video_outgoing") {
      voiceHandoff = await settleVoiceToVideoHandoff(results.find((r) => r.scenario === "o2_voice_outgoing"));
      console.log(
        `[o3-qa] voice_to_video_handoff ok=${voiceHandoff.ok} via=${voiceHandoff.via ?? "n/a"} callId=${voiceHandoff.voiceProductCleanup ? results.find((r) => r.scenario === "o2_voice_outgoing")?.callId : "n/a"}`,
      );
    } else {
      await settleBetweenScenarios();
    }

    const ctx =
      step.key === "o2_video_outgoing"
        ? {
            priorVoiceCallId: results.find((r) => r.scenario === "o2_voice_outgoing")?.callId ?? "",
            voiceHandoffReady: voiceHandoff.ok,
          }
        : {};
    const r = await step.run(ctx);
    if (r.logPath) fs.writeFileSync(r.logPath, readLogcat(SERIAL_A) + "\n" + readLogcat(SERIAL_B));
    if (step.key === "o2_video_outgoing") {
      r.voiceToVideoHandoff = voiceHandoff;
    }
    results.push(r);
    console.log(`[o3-qa] ${r.scenario} callId=${r.callId ?? "n/a"} verdict=${r.verdict}`);

    if (r.scenario === "o2_voice_outgoing") {
      await waitCallIdle(SERIAL_A);
      await waitCallIdle(SERIAL_B);
      await sleep(2000);
      continue;
    }

    await scenarioCleanupOnly();
    await waitCallIdle(SERIAL_A);
    await waitCallIdle(SERIAL_B);
    await sleep(3000);
  }

  const report = {
    at: new Date().toISOString(),
    serialA: SERIAL_A,
    serialB: SERIAL_B,
    harness: {
      voiceToVideoHandoff: "native_voice_ui_or_web_product_end",
      endAllUsage: "scenario_cleanup_only_not_product_proof",
    },
    results,
    overallPass: results.every((r) => r.verdict === "PASS"),
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ overallPass: report.overallPass, results: results.map((r) => ({ scenario: r.scenario, callId: r.callId, verdict: r.verdict })) }, null, 2));
  process.exit(report.overallPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
