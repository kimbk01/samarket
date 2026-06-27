#!/usr/bin/env node
/**
 * O4 End Ownership matrix QA — product code NO CHANGES.
 *
 * Scenarios:
 * 1. voice_local_end   — A outgoing voice connected -> A product end -> Runtime cleanup
 * 2. voice_remote_end  — A outgoing voice connected -> B product end -> A terminal cleanup
 * 3. video_local_end   — A outgoing video connected -> A product end -> Runtime cleanup
 *
 * PASS chain (same callId on subject device):
 *   terminal entry -> native_end_dispatch -> runtime_cleanup_start ->
 *   agora_native_disconnected -> native_call_service_stop -> cleanup_done
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
} from "../scripts/qa/lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, ".qa-logs", "o4-end-ownership-matrix");
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

const O4_TAIL = [
  "native_end_dispatch",
  "runtime_cleanup_start",
  "agora_native_disconnected",
  "native_call_service_stop",
  "cleanup_done",
];

function adbObj(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function adb(serial, ...args) {
  return adbObj(serial, ...args).stdout ?? "";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function clearLogcat() {
  adb(SERIAL_A, "logcat", "-c");
  adb(SERIAL_B, "logcat", "-c");
}

function forceStopApps() {
  for (const serial of [SERIAL_A, SERIAL_B]) {
    adbObj(serial, "shell", "am", "force-stop", PKG);
  }
}

function lineHasCallId(line, callId) {
  if (!callId) return false;
  if (line.includes(callId)) return true;
  const compact = callId.replace(/-/g, "");
  return compact.length >= 8 && line.includes(compact);
}

function hasMarker(logs, marker, callId) {
  return logs.split("\n").some((line) => line.includes(marker) && (!callId || lineHasCallId(line, callId)));
}

function hasO4Entry(logs, entryMarker, callId) {
  if (entryMarker === "NativeCallService.endCall") return logs.includes(entryMarker);
  return hasMarker(logs, entryMarker, callId);
}

function extractCallIdFromHref(href) {
  const match = String(href ?? "").match(/\/calls-v4\/([0-9a-f-]{36})/i);
  return match?.[1] ?? "";
}

async function buildAuth(login, expectedUserId) {
  const { cookies, userId } = await buildApkSessionCookies({
    login,
    prod: WEB,
    password: PASSWORD,
    loadEnv: loadEnvLocal,
  });
  if (userId !== expectedUserId) throw new Error(`auth_mismatch_${login}`);
  return { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") };
}

async function prodFetch(pathname, auth, init = {}) {
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
      results.push({ login, ...result, note: "scenario_cleanup_only_not_product_proof" });
    } catch (error) {
      results.push({ login, status: 0, error: String(error), note: "scenario_cleanup_only_not_product_proof" });
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
      log: (message) => console.log(`[o4-matrix] ${label} ${message}`),
      label,
      restartForFcm: false,
    });
    if (!result.ok) throw new Error(`login_${label}_fail`);
  }
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

async function waitForRoomComposerReady(page, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => {
      const hrefOk = location.href.includes("/rooms/");
      const voice = document.querySelector('button[aria-label="음성 통화"], button[aria-label="Voice call"]');
      const menu = document.querySelector('button[aria-label="채팅방 메뉴"], button[aria-label="Chat room menu"]');
      return { hrefOk, voice: voice instanceof HTMLButtonElement, menu: menu instanceof HTMLButtonElement };
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
    const textBtn = [...document.querySelectorAll("button")].find((button) => {
      const text = (button.textContent ?? "").trim();
      return labels.some((label) => text === label || new RegExp(`^${label}$`, "i").test(text));
    });
    if (textBtn instanceof HTMLElement && !textBtn.disabled) {
      textBtn.click();
      return { ok: true, via: `text:${(textBtn.textContent ?? "").trim()}` };
    }
    return { ok: false, reason: "button_missing" };
  }, media);
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
    const buttons = [...document.querySelectorAll("button")];
    const target = buttons.find((button) => {
      const label = button.getAttribute("aria-label") ?? button.textContent ?? "";
      return /추가|더 보기|more|plus|\+|첨부/i.test(label);
    });
    if (target instanceof HTMLElement) {
      target.click();
      return { ok: true, via: "composer_plus" };
    }
    return { ok: false, reason: "plus_not_found" };
  });
  if (!plusOpened.ok) return plusOpened;
  await sleep(1200);

  return page.evaluate(() => {
    const hint = [...document.querySelectorAll("button")].find((button) =>
      /미디어·파일|media files|room info|사진·파일/i.test(button.textContent ?? ""),
    );
    if (hint instanceof HTMLElement) {
      hint.click();
      return { ok: true, via: "attach_hint" };
    }
    return { ok: false, reason: "attach_hint_not_found" };
  });
}

async function handleCallPermissionModal(page, { preferAllow = true } = {}) {
  return page.evaluate((allowFirst) => {
    const modal = document.querySelector('[aria-labelledby="dibay-call-permission-modal-title"]');
    if (!modal) return { action: "none" };
    if (allowFirst) {
      const allow = [...document.querySelectorAll("button")].find((button) =>
        /^(권한 허용|Allow access)$/i.test((button.textContent ?? "").trim()),
      );
      if (allow instanceof HTMLElement) {
        allow.click();
        return { action: "allow" };
      }
    }
    return { action: "modal_present_no_action" };
  }, preferAllow);
}

async function dialOutgoing(media) {
  return cdpPage(SERIAL_A, CDP_A, async (page) => {
    const { cookies } = await buildApkSessionCookies({
      login: "aaaa",
      prod: WEB,
      password: PASSWORD,
      loadEnv: loadEnvLocal,
    });
    await page.context().addCookies(cookies);
    await navigateApkWebView(page, `${WEB}/community-messenger/rooms/${ROOM_ID}`, 10_000);
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

async function waitCallIdForOutgoing(media, timeoutMs = 60_000) {
  const marker = "caller_outgoing_start";
  const lane = media === "video" ? "DIBAY_NATIVE_VIDEO" : "DIBAY_NATIVE_VOICE";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = readLogcat(SERIAL_A);
    const matches = logs
      .split("\n")
      .filter((line) => line.includes(lane) && line.includes(marker))
      .map((line) => line.match(/callId=([0-9a-f-]{36})/i)?.[1])
      .filter(Boolean);
    if (matches.length > 0) return matches[matches.length - 1];
    await sleep(500);
  }
  return "";
}

async function waitNativeConnected(serial, callId, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = readLogcat(serial);
    if (hasMarker(logs, "native_connected_emit", callId) && hasMarker(logs, "state_connected", callId)) {
      return { ok: true, logs };
    }
    await sleep(500);
  }
  return { ok: false, logs: readLogcat(serial) };
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

function dumpUiXml(serial) {
  adbObj(serial, "shell", "uiautomator", "dump", "/sdcard/uidump.xml");
  return adb(serial, "shell", "cat", "/sdcard/uidump.xml");
}

function tapCoords(serial, x, y) {
  adb(serial, "shell", "input", "tap", String(x), String(y));
}

function parseAcceptBoundsFromLogcat(logs, callId) {
  for (let i = logs.split("\n").length - 1; i >= 0; i--) {
    const line = logs.split("\n")[i];
    if (!line.includes("accept_button_bounds") || !lineHasCallId(line, callId)) continue;
    const m = line.match(/left=(\d+)\s+top=(\d+)\s+right=(\d+)\s+bottom=(\d+)/);
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
  return { tapped: false, method: "none" };
}

async function waitIncomingOnCallee(callId, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = readLogcat(SERIAL_B);
    if (
      hasMarker(logs, "incoming_activity_shown", callId) ||
      hasMarker(logs, "incoming_fcm_received", callId) ||
      hasMarker(logs, "ring_start", callId)
    ) {
      return { ok: true, logs };
    }
    await sleep(500);
  }
  return { ok: false, logs: readLogcat(SERIAL_B) };
}

async function acceptIncomingOnB(callId) {
  wakeDevice(SERIAL_B);
  for (let i = 0; i < 12; i++) {
    const mergedLogs = `${readLogcat(SERIAL_A)}\n${readLogcat(SERIAL_B)}`;
    const ready =
      hasMarker(mergedLogs, "incoming_activity_shown", callId) ||
      hasMarker(mergedLogs, "incoming_fcm_received", callId);
    if (!ready) {
      await sleep(1000);
      continue;
    }
    const tap = tapAccept(SERIAL_B, mergedLogs, callId);
    if (tap.tapped) return tap;
    wakeDevice(SERIAL_B);
    await sleep(1200);
  }
  return { tapped: false, method: "none" };
}

async function navigateToCallScreen(serial, port, callId) {
  return cdpPage(serial, port, async (page) => {
    const { cookies } = await buildApkSessionCookies({
      login: serial === SERIAL_A ? "aaaa" : "qqqq",
      prod: WEB,
      password: PASSWORD,
      loadEnv: loadEnvLocal,
    });
    await page.context().addCookies(cookies);
    await navigateApkWebView(page, `${WEB}/community-messenger/calls-v4/${callId}?source=qa_o4_remote_end`, 10_000);
    await sleep(1500);
    adbObj(serial, "shell", "am", "start", "-n", ACT);
    await sleep(1000);
    return { ok: true, href: await page.evaluate(() => location.href), callId };
  });
}

async function clickProductEnd(serial, port, callId) {
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
      return { ok: true, via: "uiautomator", x, y, href: result.href, callId };
    }
    return result;
  });
}

function terminalSource(logs, callId) {
  const line = logs
    .split("\n")
    .find((row) => row.includes("terminal_received") && lineHasCallId(row, callId));
  const match = line?.match(/source=([^\s]+)/);
  return match?.[1] ?? "";
}

function hasHeartbeatTimeoutBeforeTerminal(logs, callId) {
  const lines = logs.split("\n").filter((row) => lineHasCallId(row, callId));
  let heartbeatAt = -1;
  let terminalAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("call_heartbeat_timeout")) heartbeatAt = i;
    if (lines[i].includes("terminal_received")) terminalAt = i;
  }
  return heartbeatAt >= 0 && terminalAt >= 0 && heartbeatAt <= terminalAt;
}

async function waitO4Chain(serial, callId, entryMarker, timeoutMs = 60_000) {
  const chain = [entryMarker, ...O4_TAIL];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = readLogcat(serial);
    const observed = Object.fromEntries(chain.map((marker) => [marker, hasO4Entry(logs, marker, callId)]));
    if (Object.values(observed).every(Boolean)) {
      return {
        ok: true,
        observed,
        logs,
        terminalSource: terminalSource(logs, callId),
        heartbeatTimeoutLed: hasHeartbeatTimeoutBeforeTerminal(logs, callId),
      };
    }
    await sleep(500);
  }
  const logs = readLogcat(serial);
  const chainAll = [entryMarker, ...O4_TAIL];
  return {
    ok: false,
    observed: Object.fromEntries(chainAll.map((marker) => [marker, hasO4Entry(logs, marker, callId)])),
    logs,
    terminalSource: terminalSource(logs, callId),
    heartbeatTimeoutLed: hasHeartbeatTimeoutBeforeTerminal(logs, callId),
  };
}

async function settleBetweenScenarios() {
  await scenarioCleanupOnly();
  await sleep(2000);
  forceStopApps();
  await sleep(2000);
  adbObj(SERIAL_A, "shell", "am", "start", "-n", ACT);
  await sleep(1500);
}

async function runVoiceLocalEnd() {
  clearLogcat();
  const dial = await dialOutgoing("voice");
  if (!dial.ok) return { scenario: "voice_local_end", pass: false, stage: "dial", dial };
  const callId = extractCallIdFromHref(dial.href) || (await waitCallIdForOutgoing("voice"));
  if (!callId) return { scenario: "voice_local_end", pass: false, stage: "call_id", dial };
  const connected = await waitNativeConnected(SERIAL_A, callId);
  if (!connected.ok) return { scenario: "voice_local_end", pass: false, stage: "connected", callId, connected };
  const endTap = await clickProductEnd(SERIAL_A, CDP_A, callId);
  const chain = await waitO4Chain(SERIAL_A, callId, "NativeCallService.endCall");
  return {
    scenario: "voice_local_end",
    callId,
    dial,
    connected: connected.ok,
    endTap,
    chain: chain.observed,
    pass: endTap.ok && chain.ok,
    subjectSerial: SERIAL_A,
    entryMarker: "NativeCallService.endCall",
  };
}

async function runVoiceRemoteEnd() {
  clearLogcat();
  await prepareCalleeForIncoming();
  wakeDevice(SERIAL_B);
  const dial = await dialOutgoing("voice");
  if (!dial.ok) return { scenario: "voice_remote_end", pass: false, stage: "dial", dial };
  const callId = extractCallIdFromHref(dial.href) || (await waitCallIdForOutgoing("voice"));
  if (!callId) return { scenario: "voice_remote_end", pass: false, stage: "call_id", dial };
  const incoming = await waitIncomingOnCallee(callId);
  if (!incoming.ok) return { scenario: "voice_remote_end", pass: false, stage: "incoming", callId, incoming };
  const acceptTap = await acceptIncomingOnB(callId);
  if (!acceptTap.tapped) return { scenario: "voice_remote_end", pass: false, stage: "accept", callId, acceptTap };
  const connectedA = await waitNativeConnected(SERIAL_A, callId);
  const connectedB = await waitNativeConnected(SERIAL_B, callId);
  if (!connectedA.ok || !connectedB.ok) {
    return {
      scenario: "voice_remote_end",
      pass: false,
      stage: "connected",
      callId,
      connectedA: connectedA.ok,
      connectedB: connectedB.ok,
    };
  }
  const navB = await navigateToCallScreen(SERIAL_B, CDP_B, callId);
  const endTap = await clickProductEnd(SERIAL_B, CDP_B, callId);
  const chain = await waitO4Chain(SERIAL_A, callId, "terminal_received", 45_000);
  const peerRemoteProof = endTap.ok && chain.ok && !chain.heartbeatTimeoutLed;
  return {
    scenario: "voice_remote_end",
    callId,
    dial,
    incoming: incoming.ok,
    acceptTap,
    connectedA: connectedA.ok,
    connectedB: connectedB.ok,
    navB,
    endTap,
    chain: chain.observed,
    terminalSource: chain.terminalSource,
    heartbeatTimeoutLed: chain.heartbeatTimeoutLed,
    pass: peerRemoteProof,
    subjectSerial: SERIAL_A,
    entryMarker: "terminal_received",
  };
}

async function runVideoLocalEnd() {
  clearLogcat();
  const dial = await dialOutgoing("video");
  if (!dial.ok) return { scenario: "video_local_end", pass: false, stage: "dial", dial };
  const callId = extractCallIdFromHref(dial.href) || (await waitCallIdForOutgoing("video"));
  if (!callId) return { scenario: "video_local_end", pass: false, stage: "call_id", dial };
  const connected = await waitNativeConnected(SERIAL_A, callId);
  if (!connected.ok) return { scenario: "video_local_end", pass: false, stage: "connected", callId, connected };
  const endTap = await clickProductEnd(SERIAL_A, CDP_A, callId);
  const chain = await waitO4Chain(SERIAL_A, callId, "NativeCallService.endCall");
  const runtimeVideo = hasMarker(readLogcat(SERIAL_A), "native_end_dispatch", callId) &&
    readLogcat(SERIAL_A).includes("runtime=video");
  return {
    scenario: "video_local_end",
    callId,
    dial,
    connected: connected.ok,
    endTap,
    chain: chain.observed,
    runtimeVideo,
    pass: endTap.ok && chain.ok && runtimeVideo,
    subjectSerial: SERIAL_A,
    entryMarker: "NativeCallService.endCall",
  };
}

const SCENARIO_FILTER = process.env.O4_SCENARIO?.trim() || "";

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  loadEnvLocal();
  console.log(`[o4-matrix] devices A=${SERIAL_A} B=${SERIAL_B} web=${WEB}`);
  const scenarioCleanup = await scenarioCleanupOnly();
  await sleep(1500);
  forceStopApps();
  await sleep(1500);
  await ensureLogin();

  const allScenarios = [
    ["voice_local_end", runVoiceLocalEnd],
    ["voice_remote_end", runVoiceRemoteEnd],
    ["video_local_end", runVideoLocalEnd],
  ];
  const selected = SCENARIO_FILTER
    ? allScenarios.filter(([name]) => name === SCENARIO_FILTER)
    : allScenarios;
  if (selected.length === 0) throw new Error(`unknown_scenario:${SCENARIO_FILTER}`);

  const results = [];
  for (const [, fn] of selected) {
    await settleBetweenScenarios();
    const result = await fn();
    const logPath = path.join(OUT, `logcat-${result.scenario}-${result.callId ?? "none"}.txt`);
    fs.writeFileSync(logPath, `${readLogcat(SERIAL_A)}\n---\n${readLogcat(SERIAL_B)}`);
    result.logPath = logPath;
    results.push(result);
    console.log(`[o4-matrix] ${result.scenario} callId=${result.callId ?? "n/a"} pass=${result.pass}`);
  }

  const report = {
    at: new Date().toISOString(),
    serialA: SERIAL_A,
    serialB: SERIAL_B,
    scenarioCleanup,
    results,
    overallPass: results.every((r) => r.pass),
    hardLockCandidate: results.every((r) => r.pass),
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.overallPass ? 0 : 1);
}

run().catch((error) => {
  console.error("[o4-matrix] failed", error);
  process.exit(1);
});
