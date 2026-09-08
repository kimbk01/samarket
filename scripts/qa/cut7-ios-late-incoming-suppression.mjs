#!/usr/bin/env node
/**
 * CUT7 — iOS LATE INCOMING SUPPRESSION device runtime (NO CODE CHANGE).
 *
 * Sequence:
 *   1) Android→iOS place Voice/Video call (real PushKit incoming)
 *   2) Caller cancel → server terminal + CallKit clear + terminalSuppressed tombstone
 *   3) Inject delayed incoming_call VoIP SAME callId via existing APNs voip path
 *      (same sendVoipApnsImpl consumer as cut7-ios-late-terminal-runtime.mjs)
 *   4) Expect CallKit report-then-end (terminal_suppress_after_incoming), no durable ring
 *
 *   KIND=voice|video \
 *   DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
 *     node scripts/qa/cut7-ios-late-incoming-suppression.mjs
 *
 * Requires:
 *   - iPhonebk connected (UDID 00008120-000025C826F3C01E)
 *   - /tmp/cut7-apns.env (or env) with APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID / topic
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import http2 from "node:http2";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  startIosSyslogCapture,
  stopIosSyslogCapture,
  mergeIosLogSources,
  linesForCall,
} from "./lib/ios-call-syslog.mjs";
import { forwardCdp, connectWebView } from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const DEVELOPER_DIR = process.env.DEVELOPER_DIR || "/Applications/Xcode.app/Contents/Developer";
const PKG = "com.dibay.app";
const SERIAL_A = "8b37179f7d94";
const IOS_UDID = "00008120-000025C826F3C01E";
const IOS_CORE = "B01DDF12-5B2F-59C3-9B8F-3AF136851ECB";
const CDP_PORT = Number(process.env.CUT7_CDP_PORT || 9575);
const ROOM = "bc3c3070-09fa-4ff6-879a-74551fa63012";
const TIGER = "5a22455c-9efc-4b93-8caf-31c6faaaf5ad";
const ORIGIN = "https://samarket.vercel.app";
const KIND = (process.env.KIND || "voice").toLowerCase() === "video" ? "video" : "voice";
const OUT = path.join(ROOT, `docs/perf/cut7-ios-late-incoming-suppression-${KIND}.json`);
const SYSLOG = `/tmp/cut7-ios-late-incoming-${KIND}.txt`;
const SYSLOG_PID = `/tmp/cut7-ios-late-incoming-${KIND}.pid`;
const APNS_ENV = process.env.CUT7_APNS_ENV || "/tmp/cut7-apns.env";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v.startsWith("`") && v.endsWith("`")) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
function loadEnv() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env"));
  loadEnvFile(APNS_ENV);
}
function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}
function xcrun(...a) {
  return spawnSync("xcrun", a, {
    encoding: "utf8",
    env: { ...process.env, DEVELOPER_DIR },
    maxBuffer: 32 * 1024 * 1024,
  });
}
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
function has(joined, re) {
  return re.test(joined);
}

function probeEnvironment() {
  const blockers = [];
  const idevice = spawnSync("idevice_id", ["-l"], { encoding: "utf8" });
  const udids = String(idevice.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!udids.includes(IOS_UDID)) {
    blockers.push(`iPhonebk UDID ${IOS_UDID} not connected (idevice_id empty/mismatch)`);
  }
  const ctl = xcrun("devicectl", "list", "devices");
  if (!String(ctl.stdout || "").includes(IOS_CORE) && !String(ctl.stdout || "").includes(IOS_UDID)) {
    blockers.push(`CoreDevice ${IOS_CORE} not listed / CoreDeviceService unavailable`);
  }
  const apnsReady =
    process.env.APNS_KEY_P8 &&
    process.env.APNS_KEY_P8 !== "[SENSITIVE]" &&
    String(process.env.APNS_KEY_P8).includes("BEGIN") &&
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID &&
    (process.env.APNS_VOIP_TOPIC || process.env.APNS_BUNDLE_ID);
  if (!apnsReady) {
    blockers.push(
      `APNs VoIP inject credentials unavailable (need ${APNS_ENV} or env: APNS_KEY_P8/KEY_ID/TEAM_ID + topic)`,
    );
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    blockers.push("supabase service env missing");
  }
  return { ok: blockers.length === 0, blockers };
}

async function fetchSession(callId) {
  const admin = adminClient();
  const { data } = await admin
    .from("community_messenger_call_sessions")
    .select("id,room_id,status,call_kind,ended_reason,ended_at,started_at")
    .eq("id", callId)
    .maybeSingle();
  return data || null;
}

async function resolveTigerVoipToken() {
  const admin = adminClient();
  const { data, error } = await admin
    .from("user_devices")
    .select("id,device_id,push_token,push_provider,is_active,updated_at")
    .eq("user_id", TIGER)
    .eq("push_provider", "voip_apns")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(3);
  if (error) return { ok: false, error: error.message };
  const row = (data || []).find((r) => String(r.push_token || "").trim());
  if (!row) return { ok: false, error: "no_active_voip_token" };
  return { ok: true, token: String(row.push_token).trim(), device_id: row.device_id };
}

function base64Url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64url");
}
function apnsJwt() {
  const key = process.env.APNS_KEY_P8?.replace(/\\n/g, "\n").trim();
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  if (!key || !keyId || !teamId) return null;
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64Url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const unsigned = `${header}.${payload}`;
  const sig = crypto.sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${base64Url(sig)}`;
}

/** Existing production consumer path — delayed incoming_call VoIP. */
async function injectVoipIncoming({ callId, token, roomId, hasVideo }) {
  const topic =
    process.env.APNS_VOIP_TOPIC?.trim() ||
    (process.env.APNS_BUNDLE_ID?.trim() ? `${process.env.APNS_BUNDLE_ID.trim()}.voip` : null);
  if (!topic) return { status: "skipped", error_message: "voip_topic_missing" };
  const jwt = apnsJwt();
  if (!jwt) return { status: "skipped", error_message: "apns_not_configured" };
  const host = process.env.APNS_PRODUCTION === "1" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const body = {
    sessionId: callId,
    session_id: callId,
    call_push_kind: "incoming_call",
    roomId,
    room_id: roomId,
    hasVideo: hasVideo ? "1" : "0",
    mediaType: hasVideo ? "video" : "voice",
    source: "cut7_late_incoming_qa",
  };
  return await new Promise((resolve) => {
    const client = http2.connect(`https://${host}`);
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "voip",
      "apns-priority": "10",
      "apns-expiration": "0",
      "content-type": "application/json",
    });
    let status = 0;
    let responseBody = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      client.close();
      if (status === 200) {
        resolve({ status: "sent", provider_response: { provider: "voip_apns", http_status: status } });
        return;
      }
      resolve({
        status: "failed",
        error_message: responseBody || `voip_http_${status}`,
        provider_response: { provider: "voip_apns", http_status: status },
      });
    });
    req.on("error", (e) => {
      client.close();
      resolve({ status: "failed", error_message: e.message });
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

function analyze(joined, callId) {
  const lines = linesForCall(joined, callId);
  const j = lines.join("\n");
  const originalIncoming = has(j, /\[voip\] received[^\n]*kind=incoming_call|kind=incoming/);
  const callkitPresent = has(j, /\[callkit\] report success|reportNewIncomingCall_ok|ios_callkit/);
  const terminalSeen = has(j, /call_canceled|tracked_incoming_end|reportCallEnded|ios_callkit_ended|remote_terminal|terminal_suppress/);
  const lateIncoming = (j.match(/\[voip\] received[^\n]*kind=incoming_call/g) || []).length >= 2
    || has(j, /source=cut7_late_incoming|incoming_call[\s\S]{0,80}late/);
  // Count incoming voip receives
  const voipIncomingCount = (j.match(/\[voip\] received[^\n]*kind=incoming(?:_call)?/g) || []).length;
  const suppressGate =
    has(j, /terminalSuppressed=true|ios_callkit_incoming_after_terminal_suppress|terminal_suppress_after_incoming/)
      ? "SUPPRESS"
      : has(j, /\[callkit\] report success/) && voipIncomingCount >= 2
        ? "ALLOW"
        : "NOT_REACHED";
  const durableAfterLate =
    has(j, /terminal_suppress_after_incoming/)
      ? false
      : voipIncomingCount >= 2 && has(j, /\[callkit\] report success/) && !has(j, /terminal_suppress_after_incoming/);
  const ringtoneAfterLate = has(j, /ring_start|ios_native_voice_missed_timer_scheduled|IncomingCallRing/);
  const runtimeResurrect = has(j, /registerIncomingSession|owner_claimed|incoming_fcm_received/) && voipIncomingCount >= 2;
  return {
    lines: lines.slice(0, 80),
    originalIncoming,
    callkitPresent,
    terminalSeen,
    voipIncomingCount,
    lateIncomingReceived: voipIncomingCount >= 2 || lateIncoming,
    suppressGate,
    callkitResurrection: durableAfterLate ? "PRESENT" : "NONE",
    ringtoneResurrection:
      suppressGate === "SUPPRESS" ? "NONE" : ringtoneAfterLate && voipIncomingCount >= 2 ? "PRESENT" : "NONE",
    runtimeResurrection: suppressGate === "SUPPRESS" ? "NONE" : runtimeResurrect ? "PRESENT" : "NONE",
  };
}

async function main() {
  loadEnv();
  const head = spawnSync("git", ["rev-parse", "--short=9", "HEAD"], { encoding: "utf8", cwd: ROOT }).stdout.trim();
  const env = probeEnvironment();
  if (!env.ok) {
    const out = {
      TITLE: "CUT7 iOS LATE INCOMING — DEVICE RUNTIME",
      HEAD: head,
      WORKTREE: "dirty — current 4 CUT7 fixes",
      DEVICE: "iPhonebk",
      KIND,
      CODE_CHANGE: "NONE",
      VERDICT: "NOT_PROVEN",
      FIRST_DIVERGENCE:
        "E.late incoming itself cannot be realistically delivered — environment blocker",
      ENVIRONMENT_BLOCKERS: env.blockers,
      LATE_INCOMING_DELIVERY_METHOD:
        "intended: existing APNs voip_apns inject (sendVoipApnsImpl path) → PushKit → VoIPPushRegistry.reportIncomingFromVoipPayload",
      ANSWERED_ELSEWHERE_LOSER: "NOT_PROVEN — DEFERRED",
      CUT7: "NOT CLOSED — FINAL LEDGER REQUIRED",
      COMMIT: "NONE",
      PUSH: "NONE",
      CUT8: "HOLD",
    };
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ VERDICT: out.VERDICT, BLOCKERS: env.blockers }, null, 2));
    console.log("wrote", OUT);
    return;
  }

  // Device path continues when env is ready (not reached in current session).
  fs.writeFileSync(SYSLOG, "");
  startIosSyslogCapture({ udid: IOS_UDID, outPath: SYSLOG, pidPath: SYSLOG_PID });
  await sleep(800);
  const offset = fs.existsSync(SYSLOG) ? fs.statSync(SYSLOG).size : 0;

  adb(SERIAL_A, "shell", "input", "keyevent", "224");
  adb(SERIAL_A, "shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callKind: kind, dialIntent: "fresh" }),
      });
      const j = await r.json().catch(() => ({}));
      return { status: r.status, callId: j?.session?.id || j?.id || null };
    },
    { roomId: ROOM, kind: KIND },
  );
  console.log("placed", placed);
  if (!placed.callId) throw new Error("no_call_id");

  await sleep(12000);
  let mid = mergeIosLogSources({
    slice: fs.existsSync(SYSLOG) ? fs.readFileSync(SYSLOG, "utf8").slice(offset) : "",
    udid: IOS_UDID,
    minutes: 3,
  });
  let midObs = analyze(mid, placed.callId);

  // Terminal: caller cancel
  await page.evaluate(async (id) => {
    await fetch(`/api/community-messenger/calls/sessions/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
  }, placed.callId);
  await sleep(8000);
  const sessTerminal = await fetchSession(placed.callId);

  const tok = await resolveTigerVoipToken();
  if (!tok.ok) throw new Error(tok.error);
  const inject = await injectVoipIncoming({
    callId: placed.callId,
    token: tok.token,
    roomId: ROOM,
    hasVideo: KIND === "video",
  });
  console.log("inject", inject);
  await sleep(8000);

  const finalJoined = mergeIosLogSources({
    slice: fs.existsSync(SYSLOG) ? fs.readFileSync(SYSLOG, "utf8").slice(offset) : "",
    udid: IOS_UDID,
    minutes: 5,
  });
  const obs = analyze(finalJoined, placed.callId);
  const finalSess = await fetchSession(placed.callId);

  const pass =
    inject.status === "sent" &&
    obs.lateIncomingReceived &&
    ["cancelled", "canceled", "missed", "ended", "rejected"].includes(String(finalSess?.status || "")) &&
    obs.suppressGate === "SUPPRESS" &&
    obs.callkitResurrection === "NONE" &&
    obs.ringtoneResurrection === "NONE" &&
    obs.runtimeResurrection === "NONE";

  const out = {
    TITLE: "CUT7 iOS LATE INCOMING — DEVICE RUNTIME",
    HEAD: head,
    DEVICE: "iPhonebk",
    KIND,
    CALL_ID: placed.callId,
    ROOM_ID: ROOM,
    TERMINAL_ACTION: "caller_cancelled",
    SERVER_FINAL: finalSess?.status || null,
    ORIGINAL_INCOMING: midObs.originalIncoming ? "YES" : "NO",
    ORIGINAL_CALLKIT: midObs.callkitPresent ? "YES" : "NO",
    ORIGINAL_UI_CLEARED: sessTerminal && sessTerminal.status !== "ringing" ? "PASS" : "FAIL",
    LATE_INCOMING_DELIVERY_METHOD: "APNs voip_apns inject → PushKit → VoIPPushRegistry",
    LATE_INJECT: inject,
    LATE_INCOMING_RECEIVED: obs.lateIncomingReceived ? "PASS" : "FAIL",
    PRESENTATION_GATE: obs.suppressGate,
    CALLKIT_RESURRECTION: obs.callkitResurrection,
    RINGTONE_RESURRECTION: obs.ringtoneResurrection,
    RUNTIME_RESURRECTION: obs.runtimeResurrection,
    STALE_UI: obs.callkitResurrection === "NONE" ? "NONE" : "PRESENT",
    VERDICT: pass ? "DEVICE_CLOSED_CELL" : "FAIL",
    CODE_CHANGE: "NONE",
    obs,
    midObs,
    session: finalSess,
  };
  stopIosSyslogCapture(IOS_UDID);
  await browser.close().catch(() => {});
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ CALL_ID: out.CALL_ID, GATE: out.PRESENTATION_GATE, VERDICT: out.VERDICT }, null, 2));
  console.log("wrote", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
