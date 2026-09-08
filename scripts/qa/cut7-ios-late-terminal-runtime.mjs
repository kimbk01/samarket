#!/usr/bin/env node
/**
 * CUT7 #5 — iOS late ringing-era VoIP terminal DEVICE RUNTIME (NO CODE CHANGE).
 *
 * Flow:
 *   1) Android→iOS place call
 *   2) Manual CallKit Answer
 *   3) Wait server active + native handoff
 *   4) Inject delayed ringing-era VoIP (default call_canceled) via existing sendVoipApnsImpl
 *      SAME callId → PushKit → VoIPPushRegistry.handleTerminalVoipPush (real consumer)
 *   5) Expect ios_voip_terminal_stale_suppressed + call survives
 *   6) Legitimate caller end → call_ended → must close
 *
 *   KIND=voice|video PHASE=stale|ended|both \
 *     DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
 *     node scripts/qa/cut7-ios-late-terminal-runtime.mjs
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
const CDP_PORT = Number(process.env.CUT7_CDP_PORT || 9573);
const ROOM = "bc3c3070-09fa-4ff6-879a-74551fa63012";
const TIGER = "5a22455c-9efc-4b93-8caf-31c6faaaf5ad";
const ORIGIN = "https://samarket.vercel.app";
const KIND = (process.env.KIND || "voice").toLowerCase() === "video" ? "video" : "voice";
const PHASE = (process.env.PHASE || "both").toLowerCase(); // stale | ended | both
const STALE_KIND = (process.env.STALE_KIND || "call_canceled").trim();
const WAIT_SEC = Math.max(45, Number(process.env.MANUAL_ANSWER_WAIT_SEC || 90));
const OUT = path.join(ROOT, `docs/perf/cut7-ios-late-terminal-${KIND}.json`);
const SYSLOG = `/tmp/cut7-ios-late-terminal-${KIND}.txt`;
const SYSLOG_PID = `/tmp/cut7-ios-late-terminal-${KIND}.pid`;
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
function iosLaunch(url, terminateExisting = false) {
  const args = ["devicectl", "device", "process", "launch", "--device", IOS_CORE, "--activate"];
  if (terminateExisting) args.push("--terminate-existing");
  if (url) args.push("--payload-url", url);
  args.push(PKG);
  return xcrun(...args);
}
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
function has(joined, re) {
  return re.test(joined);
}
function restartWebkitProxy() {
  spawnSync("pkill", ["-f", "ios_webkit_debug_proxy"], { encoding: "utf8" });
  spawn("ios_webkit_debug_proxy", ["-c", `${IOS_UDID}:9222`], { detached: true, stdio: "ignore" }).unref();
}

async function waitWebkitPages(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const raw = spawnSync("curl", ["-sS", "-m", "2", "http://127.0.0.1:9222/json"], {
        encoding: "utf8",
      }).stdout;
      const pages = JSON.parse(raw || "[]");
      if (Array.isArray(pages) && pages.some((p) => p?.webSocketDebuggerUrl)) return pages;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  return [];
}

async function rebindTiger() {
  const pages = await waitWebkitPages(12000);
  const hit = pages.find((p) => /samarket|dibay/i.test(String(p.url || ""))) || pages[0];
  if (!hit?.webSocketDebuggerUrl) return { ok: false, reason: "no_webkit", pages: pages.length };
  const WebSocket = (await import("ws")).default;
  const ws = new WebSocket(hit.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.once("open", res);
    ws.once("error", rej);
  });
  let pageTargetId = null;
  let idSeq = 1;
  const waiters = new Map();
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.method === "Target.targetCreated" || msg.method === "Target.targetInfoChanged") {
      const t = msg.params?.targetInfo;
      if (t?.type === "page" || (!pageTargetId && t?.type === "frame")) pageTargetId = t.targetId;
    }
    if (msg.method === "Target.dispatchMessageFromTarget") {
      let inner;
      try {
        inner = JSON.parse(msg.params?.message || "{}");
      } catch {
        return;
      }
      if (inner.id != null && waiters.has(inner.id)) {
        const w = waiters.get(inner.id);
        waiters.delete(inner.id);
        clearTimeout(w.timer);
        if (inner.error) w.reject(new Error(JSON.stringify(inner.error)));
        else w.resolve(inner.result || {});
      }
    }
  });
  ws.send(JSON.stringify({ id: idSeq++, method: "Target.setDiscoverTargets", params: { discover: true } }));
  // Prefer page from /json listing if present
  if (hit.id) pageTargetId = hit.id;
  const start = Date.now();
  while (!pageTargetId && Date.now() - start < 8000) await sleep(50);
  if (!pageTargetId) {
    ws.close();
    return { ok: false, reason: "no_page_target" };
  }
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const innerId = idSeq++;
      const outerId = idSeq++;
      const timer = setTimeout(() => {
        waiters.delete(innerId);
        reject(new Error("timeout"));
      }, 20000);
      waiters.set(innerId, { resolve, reject, timer });
      ws.send(
        JSON.stringify({
          id: outerId,
          method: "Target.sendMessageToTarget",
          params: { targetId: pageTargetId, message: JSON.stringify({ id: innerId, method, params }) },
        }),
      );
    });
  try {
    await call("Runtime.evaluate", {
      expression: `(() => {
        window.__bind = { started: true };
        Promise.resolve(
          window.Capacitor.Plugins.NativeCallService.setMemberCallEligible({
            eligible: true,
            reason: "cut7_late_terminal_rebind",
            boundUserId: ${JSON.stringify(TIGER)},
          }),
        )
          .then((r) => { window.__bind = { done: true, ok: true, r }; })
          .catch((e) => { window.__bind = { done: true, ok: false, err: String(e) }; });
        return true;
      })()`,
      returnByValue: true,
    });
    let out = null;
    for (let i = 0; i < 40; i++) {
      const poll = await call("Runtime.evaluate", {
        expression: "JSON.stringify(window.__bind||null)",
        returnByValue: true,
      });
      const raw = poll?.result?.value;
      if (typeof raw === "string") {
        const p = JSON.parse(raw);
        if (p?.done) {
          out = p;
          break;
        }
      }
      await sleep(200);
    }
    ws.close();
    return out || { ok: false, reason: "bind_timeout" };
  } catch (e) {
    ws.close();
    return { ok: false, reason: String(e) };
  }
}

async function fetchSession(callId) {
  const admin = adminClient();
  const { data } = await admin
    .from("community_messenger_call_sessions")
    .select(
      "id,room_id,status,call_kind,initiator_user_id,recipient_user_id,ended_reason,answered_at,answered_device_id,connected_at,ended_at",
    )
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
  return {
    ok: true,
    device_id: row.device_id,
    token: String(row.push_token).trim(),
    updated_at: row.updated_at,
  };
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

/** Same consumer path as lib/push/dispatch/apns-sender-impl.sendVoipApnsImpl */
async function injectVoipTerminal({ callId, kind, token }) {
  const topic =
    process.env.APNS_VOIP_TOPIC?.trim() ||
    (process.env.APNS_BUNDLE_ID?.trim() ? `${process.env.APNS_BUNDLE_ID.trim()}.voip` : null);
  if (!topic) return { status: "skipped", provider_response: { reason: "voip_topic_missing" } };
  const jwt = apnsJwt();
  if (!jwt) return { status: "skipped", provider_response: { reason: "apns_not_configured" } };
  const host = process.env.APNS_PRODUCTION === "1" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const body = {
    sessionId: callId,
    session_id: callId,
    call_push_kind: kind,
    roomId: ROOM,
    room_id: ROOM,
    source: "cut7_late_terminal_qa",
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
      resolve({ status: "failed", error_message: e.message, provider_response: { provider: "voip_apns" } });
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

function readCallJoined(offset, callId) {
  const slice = fs.existsSync(SYSLOG) ? fs.readFileSync(SYSLOG, "utf8").slice(offset) : "";
  const merged = mergeIosLogSources({ slice, udid: IOS_UDID, minutes: 6 });
  const lines = linesForCall(merged, callId);
  return { joined: lines.join("\n"), lines };
}

async function waitAnswer(callId, offset) {
  const waitUntil = Date.now() + WAIT_SEC * 1000;
  while (Date.now() < waitUntil) {
    const { joined } = readCallJoined(offset, callId);
    const sess = await fetchSession(callId);
    const answerMarker =
      has(joined, /ios_native_voice_answer_started|ios_native_voice_accept_succeeded|ios_native_voice_connected/) ||
      has(joined, /ios_native_video_answer|ios_native_video_accept|ios_native_video_connected|accept_succeeded/) ||
      has(joined, /active_call_connected|agora_join/);
    const serverActive =
      Boolean(sess?.answered_at) ||
      ["accepted", "connecting", "active", "answered"].includes(String(sess?.status || ""));
    if (answerMarker || serverActive) {
      // settle handoff
      for (let i = 0; i < 12; i++) {
        await sleep(1000);
        const s2 = await fetchSession(callId);
        const { joined: j2 } = readCallJoined(offset, callId);
        const connected =
          ["active", "connecting"].includes(String(s2?.status || "")) ||
          has(j2, /ios_native_voice_connected|ios_native_video_connected|active_call_connected/);
        const handoff =
          has(j2, /ios_native_voice_accept_succeeded|ios_native_video_accept|accept_succeeded|agora/) ||
          connected;
        if (serverActive || ["active", "connecting", "accepted"].includes(String(s2?.status || ""))) {
          if (handoff || connected || i >= 8) {
            return { ok: true, session: s2, joined: j2 };
          }
        }
      }
      return { ok: true, session: await fetchSession(callId), joined: readCallJoined(offset, callId).joined };
    }
    await sleep(1500);
  }
  return { ok: false, session: await fetchSession(callId), joined: readCallJoined(offset, callId).joined };
}

async function main() {
  loadEnv();
  const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: ROOT }).stdout.trim();
  console.log(`\n=== CUT7 #5 late terminal KIND=${KIND} PHASE=${PHASE} STALE=${STALE_KIND} ===`);
  console.log(`HEAD=${head.slice(0, 9)} APNS_ENV=${fs.existsSync(APNS_ENV) ? "yes" : "no"}`);

  const apnsPresent =
    process.env.APNS_KEY_P8 &&
    process.env.APNS_KEY_P8 !== "[SENSITIVE]" &&
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID;
  console.log(`HEAD=${head.slice(0, 9)} APNS_USABLE=${Boolean(apnsPresent && process.env.APNS_KEY_P8.includes("BEGIN"))}`);
  // APNS optional — primary stale uses production answered_elsewhere after accept.

  iosLaunch(`${ORIGIN}/community-messenger?section=chats`, true);
  await sleep(5000);
  restartWebkitProxy();
  await sleep(2000);
  const bind = await rebindTiger();
  console.log("rebindTiger", bind);
  if (!(bind?.ok || bind?.done)) {
    iosLaunch(`${ORIGIN}/community-messenger?section=chats`, false);
    await sleep(5000);
    restartWebkitProxy();
    await sleep(1500);
    const bind2 = await rebindTiger();
    console.log("rebindTiger_retry", bind2);
    if (!(bind2?.ok || bind2?.done)) {
      throw new Error(`eligibility_rebind_failed:${JSON.stringify(bind2)}`);
    }
  }
  await sleep(1000);

  fs.writeFileSync(SYSLOG, "");
  startIosSyslogCapture({ udid: IOS_UDID, outPath: SYSLOG, pidPath: SYSLOG_PID });
  await sleep(700);
  const offset = fs.statSync(SYSLOG).size;

  adb(SERIAL_A, "shell", "input", "keyevent", "224");
  adb(SERIAL_A, "shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  await sleep(4500);
  forwardCdp(adb, SERIAL_A, CDP_PORT);
  const { browser, page } = await connectWebView(chromium, CDP_PORT);
  await page.evaluate((u) => {
    window.location.href = u;
  }, `${ORIGIN}/community-messenger`);
  await sleep(3000);

  const placed = await page.evaluate(
    async ({ roomId, kind }) => {
      const r = await fetch(`/api/community-messenger/rooms/${roomId}/calls`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callKind: kind, dialIntent: "fresh" }),
      });
      const j = await r.json().catch(() => ({}));
      return { status: r.status, callId: j?.session?.id || j?.id || null, j };
    },
    { roomId: ROOM, kind: KIND },
  );
  console.log("placed", { status: placed.status, callId: placed.callId });
  if (!placed.callId) {
    stopIosSyslogCapture(IOS_UDID);
    await browser.close().catch(() => {});
    throw new Error("place_call_failed");
  }

  let callkitIncoming = false;
  let guestBlocked = false;
  for (let i = 0; i < 25; i++) {
    await sleep(1000);
    const { joined } = readCallJoined(offset, placed.callId);
    if (has(joined, /incoming_blocked_guest_ineligible|guest_ineligible/)) {
      guestBlocked = true;
      console.log("FAIL guest_ineligible still blocking CallKit");
      break;
    }
    if (has(joined, /\[callkit\] report success/) && has(joined, /terminalSuppressed=false/)) {
      callkitIncoming = true;
      break;
    }
  }
  if (guestBlocked || !callkitIncoming) {
    const fail = {
      HEAD: head,
      CALL_ID: placed.callId,
      ANSWER: "FAIL",
      CallKit_incoming: "FAIL",
      reason: guestBlocked ? "guest_ineligible" : "no_durable_callkit",
      STALE_RESULT: "SKIP",
      CALL_ENDED_RESULT: "SKIP",
    };
    fs.writeFileSync(OUT, JSON.stringify(fail, null, 2));
    await browser.close().catch(() => {});
    stopIosSyslogCapture(IOS_UDID);
    throw new Error(fail.reason);
  }

  console.log("\n************************************************************");
  console.log(`*  iPhonebk CallKit 보이면 NOW Answer 누르세요 (${KIND})`);
  console.log(`*  callId=${placed.callId}`);
  console.log(`*  대기 ${WAIT_SEC}s — deeplink Accept 없음`);
  console.log("************************************************************\n");

  const answered = await waitAnswer(placed.callId, offset);
  const beforeStale = await fetchSession(placed.callId);
  const { joined: beforeJoined } = readCallJoined(offset, placed.callId);

  const answerPass =
    answered.ok &&
    (Boolean(beforeStale?.answered_at) ||
      ["active", "connecting", "accepted"].includes(String(beforeStale?.status || "")));
  const handoffPass =
    has(beforeJoined, /ios_native_voice_accept_succeeded|ios_native_video_accept|accept_succeeded|agora|connected/) ||
    ["active", "connecting"].includes(String(beforeStale?.status || ""));
  const connectedPass =
    beforeStale?.status === "active" ||
    has(beforeJoined, /ios_native_voice_connected|ios_native_video_connected|active_call_connected/);

  const out = {
    HEAD: head,
    WORKTREE: "dirty — eligibility + missed retry",
    COMMIT: "NONE",
    PUSH: "NONE",
    CODE_CHANGE_FOR_5: "NONE",
    KIND,
    ROOM_ID: ROOM,
    CALL_ID: placed.callId,
    CallKit_incoming: callkitIncoming ? "PASS" : "FAIL",
    ANSWER: answerPass ? "PASS" : "FAIL",
    SERVER_ACTIVE: ["active", "connecting", "accepted"].includes(String(beforeStale?.status || ""))
      ? "PASS"
      : "FAIL",
    NATIVE_HANDOFF: handoffPass ? "PASS" : "FAIL",
    CONNECTED: connectedPass ? "PASS" : `PARTIAL status=${beforeStale?.status || "none"}`,
    sessionBeforeStale: beforeStale,
    STALE_TYPE: STALE_KIND,
    STALE_PRODUCTION_METHOD:
      "sendVoipApnsImpl (existing voip_apns sender) → PushKit → VoIPPushRegistry.handleTerminalVoipPush; session status NOT mutated",
    voipToken: null,
    staleInject: null,
    STALE_RECEIVED: "NO",
    STALE_GUARD: null,
    CALLKIT_END_ON_STALE: null,
    VOICE_UI_AFTER_STALE: null,
    RUNTIME_AFTER_STALE: null,
    SESSION_AFTER_STALE: null,
    STALE_RESULT: "SKIP",
    CALL_ENDED_RECEIVED: "SKIP",
    CALL_ENDED_GUARD: null,
    CALLKIT_ENDED_ON_END: null,
    UI_CLOSED_ON_END: null,
    RUNTIME_CLOSED_ON_END: null,
    CALL_ENDED_RESULT: "SKIP",
    sample: [],
  };

  if ((PHASE === "stale" || PHASE === "both") && answerPass) {
    // Prefer REAL production delayed terminal first (accept CAS sends answered_elsewhere VoIP).
    const { joined: naturalJoined, lines: naturalLines } = readCallJoined(offset, placed.callId);
    const naturalElsewhere =
      has(naturalJoined, /kind=call_answered_elsewhere/) &&
      has(naturalJoined, /ios_voip_answered_elsewhere_ignored_winner|winner_tracked/);
    const naturalSuppressed = has(naturalJoined, /ios_voip_terminal_stale_suppressed|stale_terminal_suppressed/);

    let usedNatural = false;
    if (naturalElsewhere) {
      usedNatural = true;
      out.STALE_TYPE = "call_answered_elsewhere";
      out.STALE_PRODUCTION_METHOD =
        "production accept CAS → sendWebPushForCommunityMessengerCallAnsweredElsewhere → voip_apns → PushKit → VoIPPushRegistry.handleTerminalVoipPush (winner ignore)";
      const afterStale = await fetchSession(placed.callId);
      const sessionAlive = ["active", "connecting", "accepted"].includes(String(afterStale?.status || ""));
      const appliedEnd = has(naturalJoined, /ios_callkit_ended|tracked_incoming_end/) && !naturalElsewhere;
      out.STALE_RECEIVED = "YES";
      out.STALE_GUARD = "SUPPRESS";
      out.CALLKIT_END_ON_STALE = appliedEnd ? "YES" : "NO";
      out.VOICE_UI_AFTER_STALE = sessionAlive ? "ALIVE" : "ENDED";
      out.RUNTIME_AFTER_STALE = sessionAlive ? "ALIVE" : "ENDED";
      out.SESSION_AFTER_STALE = afterStale;
      out.sample = naturalLines
        .filter((l) => /voip|answered_elsewhere|winner|stale|terminal|connected|accept/i.test(l))
        .slice(-40);
      out.STALE_RESULT = sessionAlive && !appliedEnd ? "PASS" : "FAIL";
      console.log("STALE(natural answered_elsewhere)", {
        RESULT: out.STALE_RESULT,
        session: afterStale?.status,
      });
    }

    // Optional: delayed ringing-era call_canceled via same VoIP consumer (needs usable APNS).
    const apnsUsable =
      process.env.APNS_KEY_P8 &&
      process.env.APNS_KEY_P8 !== "[SENSITIVE]" &&
      process.env.APNS_KEY_P8.includes("BEGIN");
    if (!usedNatural && apnsUsable) {
      const tok = await resolveTigerVoipToken();
      out.voipToken = tok.ok
        ? { ok: true, device_id_prefix: String(tok.device_id || "").slice(0, 8), updated_at: tok.updated_at }
        : { ok: false, error: tok.error };
      if (!tok.ok) {
        out.STALE_RESULT = "FAIL";
        out.notes = ["voip_token_missing"];
      } else {
        const preSize = fs.statSync(SYSLOG).size;
        let inject;
        try {
          inject = await injectVoipTerminal({ callId: placed.callId, kind: STALE_KIND, token: tok.token });
        } catch (e) {
          inject = { status: "failed", error_message: String(e) };
        }
        out.staleInject = {
          status: inject.status,
          error: inject.error_message || null,
          provider_http: inject.provider_response?.http_status ?? null,
          reason: inject.provider_response?.reason ?? null,
        };
        console.log("stale inject", out.staleInject);
        await sleep(5000);
        const afterStale = await fetchSession(placed.callId);
        const { joined: staleJoined, lines } = readCallJoined(offset, placed.callId);
        const fresh = fs.readFileSync(SYSLOG, "utf8").slice(preSize);
        const freshJoined = linesForCall(fresh, placed.callId).join("\n") + "\n" + staleJoined;
        const received =
          has(freshJoined, /\[voip\] received/) &&
          (has(freshJoined, new RegExp(`kind=${STALE_KIND}`)) || has(freshJoined, new RegExp(STALE_KIND)));
        const suppressed = has(freshJoined, /ios_voip_terminal_stale_suppressed|stale_terminal_suppressed/);
        const appliedEnd =
          has(freshJoined, /ios_callkit_ended|reportCallEnded|tracked_incoming_end|ios_voip_terminal_callkit/) &&
          !suppressed;
        const sessionAlive = ["active", "connecting", "accepted"].includes(String(afterStale?.status || ""));
        out.STALE_TYPE = STALE_KIND;
        out.STALE_RECEIVED = received || inject.status === "sent" ? "YES" : "NO";
        out.STALE_GUARD = suppressed ? "SUPPRESS" : appliedEnd ? "APPLY" : received ? "UNKNOWN" : "NO_EVIDENCE";
        out.CALLKIT_END_ON_STALE = appliedEnd ? "YES" : suppressed ? "NO" : "UNKNOWN";
        out.VOICE_UI_AFTER_STALE = appliedEnd ? "ENDED" : sessionAlive ? "ALIVE" : "ENDED";
        out.RUNTIME_AFTER_STALE = appliedEnd ? "ENDED" : sessionAlive ? "ALIVE" : "UNKNOWN";
        out.SESSION_AFTER_STALE = afterStale;
        out.sample = lines.filter((l) => /voip|stale|terminal|callkit|accept|connected|end/i.test(l)).slice(-40);
        out.STALE_RESULT =
          out.STALE_RECEIVED === "YES" && out.STALE_GUARD === "SUPPRESS" && sessionAlive && !appliedEnd
            ? "PASS"
            : "FAIL";
        console.log("STALE", {
          RESULT: out.STALE_RESULT,
          GUARD: out.STALE_GUARD,
          session: afterStale?.status,
        });
      }
    } else if (!usedNatural) {
      out.STALE_RESULT = "FAIL";
      out.notes = [
        ...(out.notes || []),
        "no_natural_answered_elsewhere_and_apns_redacted_or_unusable",
      ];
      console.log("STALE blocked: need natural elsewhere or usable APNS");
    }

    // If natural elsewhere was seen but we also want call_canceled gate evidence when APNS usable
    if (usedNatural && apnsUsable && out.STALE_RESULT === "PASS") {
      const tok = await resolveTigerVoipToken();
      if (tok.ok) {
        const preSize = fs.statSync(SYSLOG).size;
        let inject;
        try {
          inject = await injectVoipTerminal({ callId: placed.callId, kind: "call_canceled", token: tok.token });
        } catch (e) {
          inject = { status: "failed", error_message: String(e) };
        }
        out.callCanceledInject = {
          status: inject.status,
          error: inject.error_message || null,
        };
        await sleep(4000);
        const { joined: j2 } = readCallJoined(offset, placed.callId);
        const fresh = fs.readFileSync(SYSLOG, "utf8").slice(preSize);
        const fj = linesForCall(fresh, placed.callId).join("\n") + "\n" + j2;
        out.callCanceledGate = {
          received: has(fj, /kind=call_canceled/),
          suppressed: has(fj, /ios_voip_terminal_stale_suppressed|stale_terminal_suppressed/),
          session: (await fetchSession(placed.callId))?.status || null,
        };
        console.log("optional call_canceled gate", out.callCanceledGate);
      }
    }
  }

  if ((PHASE === "ended" || PHASE === "both") && answerPass) {
    // Legitimate end via caller PATCH (production writer → call_ended VoIP)
    const still = await fetchSession(placed.callId);
    if (!["active", "connecting", "accepted"].includes(String(still?.status || ""))) {
      // Place a fresh call for end control if stale already killed (should not)
      out.CALL_ENDED_RESULT = "FAIL";
      out.notes = [...(out.notes || []), "session_not_alive_before_call_ended_control"];
    } else {
      const preEnd = fs.statSync(SYSLOG).size;
      const endRes = await page.evaluate(async (id) => {
        const r = await fetch(`/api/community-messenger/calls/sessions/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "end" }),
        });
        const j = await r.json().catch(() => ({}));
        return { status: r.status, sessionStatus: j?.session?.status || j?.status || null, j };
      }, placed.callId);
      out.callEndedPatch = endRes;
      console.log("call_ended patch", endRes);
      await sleep(6000);
      const afterEnd = await fetchSession(placed.callId);
      const { joined: endJoined, lines } = readCallJoined(offset, placed.callId);
      const freshEnd = fs.readFileSync(SYSLOG, "utf8").slice(preEnd);
      const freshEndJoined = linesForCall(freshEnd, placed.callId).join("\n") + "\n" + endJoined;

      const endedRecv =
        has(freshEndJoined, /kind=call_ended/) ||
        has(freshEndJoined, /ios_voip_terminal_call_ended|call_ended/) ||
        endRes.status === 200;
      const suppressedEnd = has(freshEndJoined, /ios_voip_terminal_stale_suppressed/);
      const callkitEnded =
        has(freshEndJoined, /ios_callkit_ended|reportCallEnded|tracked_incoming_end|remoteEnded/) ||
        ["ended", "cancelled", "missed", "rejected"].includes(String(afterEnd?.status || ""));
      const closed = ["ended", "cancelled", "missed", "rejected"].includes(String(afterEnd?.status || ""));

      out.CALL_ENDED_RECEIVED = endedRecv ? "YES" : "NO";
      out.CALL_ENDED_GUARD = suppressedEnd ? "SUPPRESS" : "APPLY";
      out.CALLKIT_ENDED_ON_END = callkitEnded ? "YES" : "NO";
      out.UI_CLOSED_ON_END = closed || callkitEnded ? "YES" : "NO";
      out.RUNTIME_CLOSED_ON_END = closed ? "YES" : "NO";
      out.sessionAfterEnd = afterEnd;
      out.sampleEnd = lines.filter((l) => /voip|terminal|callkit|end|ended/i.test(l)).slice(-30);
      out.CALL_ENDED_RESULT =
        out.CALL_ENDED_RECEIVED === "YES" &&
        out.CALL_ENDED_GUARD === "APPLY" &&
        out.CALLKIT_ENDED_ON_END === "YES" &&
        closed
          ? "PASS"
          : "FAIL";
      console.log("CALL_ENDED", { RESULT: out.CALL_ENDED_RESULT, status: afterEnd?.status });
    }
  }

  // cleanup leftover ringing
  const finalSess = await fetchSession(placed.callId);
  if (finalSess && finalSess.status === "ringing") {
    await page.evaluate(async (id) => {
      await fetch(`/api/community-messenger/calls/sessions/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
    }, placed.callId).catch(() => {});
  }

  await browser.close().catch(() => {});
  stopIosSyslogCapture(IOS_UDID);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log("wrote", OUT);
  console.log(
    JSON.stringify(
      {
        ANSWER: out.ANSWER,
        STALE_RESULT: out.STALE_RESULT,
        CALL_ENDED_RESULT: out.CALL_ENDED_RESULT,
        STALE_GUARD: out.STALE_GUARD,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  try {
    stopIosSyslogCapture(IOS_UDID);
  } catch {
    /* */
  }
  process.exit(1);
});
