#!/usr/bin/env node
/**
 * CUT7 — iOS MISSED #4 runtime classification (NO CODE CHANGE).
 * LOCKED Voice/Video — no Accept / no Reject — natural expire.
 *
 *   KIND=voice|video \
 *   DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
 *     node scripts/qa/cut7-ios-missed-runtime-classify.mjs
 */
import { spawn, spawnSync } from "node:child_process";
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
const CDP_PORT = Number(process.env.CUT7_CDP_PORT || 9571);
const ROOM = "bc3c3070-09fa-4ff6-879a-74551fa63012";
const WWWW = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";
const TIGER = "5a22455c-9efc-4b93-8caf-31c6faaaf5ad";
const ORIGIN = "https://samarket.vercel.app";
const KIND = (process.env.KIND || "voice").toLowerCase() === "video" ? "video" : "voice";
const WAIT_MS = Math.max(45000, Number(process.env.MISSED_WAIT_MS || 55000));
const OUT = path.join(ROOT, `docs/perf/cut7-ios-missed-runtime-${KIND}.json`);
const SYSLOG = `/tmp/cut7-ios-missed-${KIND}.txt`;
const SYSLOG_PID = `/tmp/cut7-ios-missed-${KIND}.pid`;

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
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}
function sh(serial, ...args) {
  const r = adb(serial, ...args);
  return `${r.stdout ?? ""}${r.stderr ?? ""}`;
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
function iosBackground() {
  return xcrun("devicectl", "device", "process", "launch", "--device", IOS_CORE, "--activate", "com.apple.Preferences");
}
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function restartWebkitProxy() {
  spawnSync("pkill", ["-f", "ios_webkit_debug_proxy"], { encoding: "utf8" });
  spawn(
    "ios_webkit_debug_proxy",
    ["-c", `${IOS_UDID}:9222`],
    { detached: true, stdio: "ignore" },
  ).unref();
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
  try {
    const pages = await waitWebkitPages(8000);
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
      if (msg.method === "Target.targetCreated") {
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
          inner.error ? w.reject(new Error(JSON.stringify(inner.error))) : w.resolve(inner.result || {});
        }
      }
    });
    // Flat Runtime.evaluate first (ios_webkit often exposes page target directly)
    const evalDirect = () =>
      new Promise((resolve, reject) => {
        const id = idSeq++;
        const timer = setTimeout(() => {
          waiters.delete(id);
          reject(new Error("timeout_direct"));
        }, 12000);
        waiters.set(id, { resolve, reject, timer });
        ws.on("message", function onMsg(raw) {
          let msg;
          try {
            msg = JSON.parse(String(raw));
          } catch {
            return;
          }
          if (msg.id === id) {
            ws.off("message", onMsg);
            clearTimeout(timer);
            waiters.delete(id);
            msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result || {});
          }
        });
        ws.send(
          JSON.stringify({
            id,
            method: "Runtime.evaluate",
            params: {
              expression: `(() => {
                try {
                  const p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeCallService;
                  if (!p || typeof p.setMemberCallEligible !== 'function') return JSON.stringify({ok:false, reason:'no_plugin'});
                  p.setMemberCallEligible({ eligible:true, reason:'cut7_missed_rebind', boundUserId:${JSON.stringify(TIGER)} });
                  return JSON.stringify({ok:true});
                } catch (e) { return JSON.stringify({ok:false, reason:String(e)}); }
              })()`,
              returnByValue: true,
            },
          }),
        );
      });
    try {
      const r = await evalDirect();
      ws.close();
      try {
        return JSON.parse(r?.result?.value || "{}");
      } catch {
        return { ok: false, reason: "parse_direct" };
      }
    } catch (directErr) {
      // fall through to Target API
      const start = Date.now();
      while (!pageTargetId && Date.now() - start < 5000) await sleep(50);
      if (!pageTargetId) {
        ws.close();
        return { ok: false, reason: `no_target_after_direct:${String(directErr)}` };
      }
      const call = (method, params = {}) =>
        new Promise((resolve, reject) => {
          const innerId = idSeq++;
          const outerId = idSeq++;
          const timer = setTimeout(() => {
            waiters.delete(innerId);
            reject(new Error("timeout"));
          }, 12000);
          waiters.set(innerId, { resolve, reject, timer });
          ws.send(
            JSON.stringify({
              id: outerId,
              method: "Target.sendMessageToTarget",
              params: { targetId: pageTargetId, message: JSON.stringify({ id: innerId, method, params }) },
            }),
          );
        });
      const r = await call("Runtime.evaluate", {
        expression: `(() => {
          try {
            const p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeCallService;
            if (!p || typeof p.setMemberCallEligible !== 'function') return JSON.stringify({ok:false, reason:'no_plugin'});
            p.setMemberCallEligible({ eligible:true, reason:'cut7_missed_rebind', boundUserId:${JSON.stringify(TIGER)} });
            return JSON.stringify({ok:true});
          } catch (e) { return JSON.stringify({ok:false, reason:String(e)}); }
        })()`,
        returnByValue: true,
      });
      ws.close();
      try {
        return JSON.parse(r?.result?.value || "{}");
      } catch {
        return { ok: false, reason: "parse" };
      }
    }
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

async function prepareLocked() {
  // Ensure device can launch (not stuck locked from prior sleep without wake)
  const launch1 = iosLaunch(`${ORIGIN}/community-messenger?section=chats`, true);
  const launchErr = `${launch1.stderr || ""}${launch1.stdout || ""}`;
  if (/could not be, unlocked|device was not/i.test(launchErr)) {
    throw new Error("device_locked_cannot_prep_eligibility — unlock iPhonebk once then retry");
  }
  await sleep(7000);
  restartWebkitProxy();
  await sleep(2500);
  let rebound = { ok: false, reason: "not_attempted" };
  for (let i = 0; i < 6; i++) {
    rebound = await rebindTiger();
    console.log(`[ios-missed] rebind attempt ${i + 1}`, rebound);
    if (rebound?.ok) break;
    await sleep(2000);
    if (i === 2) {
      iosLaunch(`${ORIGIN}/community-messenger?section=chats`, false);
      await sleep(5000);
      restartWebkitProxy();
      await sleep(2500);
    }
  }
  if (!rebound?.ok) {
    throw new Error(`eligibility_rebind_failed:${rebound?.reason || "unknown"}`);
  }
  await sleep(1000);
  iosBackground();
  await sleep(1000);
  spawnSync("idevicediagnostics", ["-u", IOS_UDID, "sleep"], { encoding: "utf8" });
  await sleep(2500);
  return { rebound };
}

async function ensureCaller() {
  sh(SERIAL_A, "shell", "input", "keyevent", "224");
  sh(SERIAL_A, "shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  await sleep(4000);
  forwardCdp((s, ...a) => adb(s, ...a), SERIAL_A, CDP_PORT);
  const { browser, page } = await connectWebView(chromium, CDP_PORT);
  await page.evaluate((u) => {
    window.location.href = u;
  }, `${ORIGIN}/community-messenger?section=chats`);
  await sleep(3500);
  return { browser, page };
}

async function placeCall(page, kind) {
  const res = await page.evaluate(
    async ({ roomId, kind }) => {
      const r = await fetch(`/api/community-messenger/rooms/${roomId}/calls`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ callKind: kind, dialIntent: "fresh" }),
      });
      const j = await r.json().catch(() => ({}));
      return { status: r.status, j };
    },
    { roomId: ROOM, kind },
  );
  const callId = res?.j?.session?.id || res?.j?.call?.id || res?.j?.id || res?.j?.sessionId || null;
  return { ...res, callId, placedAt: new Date().toISOString() };
}

async function cancelCall(page, callId) {
  if (!callId) return;
  await page.evaluate(async (id) => {
    await fetch(`/api/community-messenger/calls/sessions/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
  }, callId).catch(() => {});
}

async function fetchSession(callId) {
  const admin = adminClient();
  const { data } = await admin
    .from("community_messenger_call_sessions")
    .select(
      "id,room_id,status,call_kind,initiator_user_id,recipient_user_id,ended_reason,answered_at,answered_device_id,started_at,ended_at,connected_at",
    )
    .eq("id", callId)
    .maybeSingle();
  return data;
}

function analyze(raw, callId, kind) {
  // Include native video NSLog prefix too
  const all = raw
    .split("\n")
    .filter(
      (l) =>
        /DIBAY_CALL|DIBAY_CALL_V4|DIBAY_NATIVE_VIDEO|DIBAY_CALL_CORR/.test(l) &&
        (l.includes(callId) ||
          l.includes(callId.slice(0, 8)) ||
          (() => {
            const c = callId.replace(/-/g, "");
            return l.toLowerCase().includes(`${c.slice(0, 4)}…${c.slice(-4)}`) || l.toLowerCase().includes(`${c.slice(0, 4)}...${c.slice(-4)}`);
          })()),
    );
  const hit = (re) => all.some((l) => re.test(l));
  const first = (re) => all.find((l) => re.test(l)) || null;
  const timerArmed = hit(/missed_timer_scheduled|ios_native_voice_missed_timer_scheduled/);
  // video scheduleMissedLocked does NOT log schedule marker currently — detect via voip incoming + later propose
  const propose = first(/missed_propose|ios_native_voice_missed_propose/);
  const early = first(/missed_early_rejected|ios_native_voice_missed_early_rejected/);
  const blocked = first(/missed_propose_blocked|ios_native_voice_missed_propose_blocked/);
  const failed = first(/missed_propose_failed|ios_native_voice_missed_propose_failed/);
  const dismiss = first(/missed_timeout|ios_native_voice_missed_local_dismiss/);
  const unanswered = first(/unanswered|endedReason=unanswered|reportCallEnded.*unanswered|callkit.*unanswered/i);
  const callkitEnd = first(/\[callkit\].*end|reportCallEnded|ios_callkit.*end|callkit end/i);
  const missedVoip = first(/kind=missed_call|missed_call/);
  const accept = hit(/answer_started|accept_started|accept_succeeded/);
  const reject = hit(/reject|CXEndCallAction|decline/);
  return {
    voipIncoming: hit(/kind=incoming_call|incoming_call/),
    callkitReport: hit(/\[callkit\] report success|report start/),
    timerArmed: timerArmed || (kind === "video" && hit(/\[voip\] received/)), // video no schedule log
    timerArmedExact: timerArmed,
    proposeLine: propose,
    earlyRejectLine: early,
    blockedLine: blocked,
    failedLine: failed,
    dismissLine: dismiss,
    unansweredLine: unanswered,
    callkitEndLine: callkitEnd,
    missedVoipLine: missedVoip,
    acceptContamination: accept,
    rejectContamination: reject,
    sample: all.slice(0, 60),
    allCount: all.length,
  };
}

function classify(obs, session) {
  if (obs.acceptContamination) return "CONTAMINATED_ACCEPT — not a missed run";
  if (!obs.voipIncoming || !obs.callkitReport) return "PRESENTATION_FAIL";
  if (!obs.proposeLine && !obs.dismissLine && session?.status === "ringing") return "A — native proposer never fires (or never logged)";
  if (obs.earlyRejectLine && !obs.dismissLine && session?.status !== "missed")
    return "B — proposer fires too early → server rejects → no later retry";
  if (session?.status === "missed" && !obs.missedVoipLine && !obs.dismissLine && !obs.unansweredLine)
    return "C — server marks missed → iOS never consumes terminal";
  if ((obs.missedVoipLine || obs.dismissLine) && obs.callkitEndLine && !obs.unansweredLine && !/unanswered/i.test(obs.callkitEndLine || ""))
    return "D — iOS consumes missed → wrong CallKit end reason";
  if ((obs.unansweredLine || /unanswered/i.test(obs.dismissLine || "")) && session?.status === "missed")
    return "E_CHECK — CallKit end may be correct; verify stale UI/ringtone";
  if (session?.status === "missed" && (obs.dismissLine || obs.unansweredLine || obs.missedVoipLine))
    return "LIKELY_PASS — verify UI removed / ringtone stop";
  if (session?.status && session.status !== "missed" && session.status !== "ringing")
    return `UNEXPECTED_SESSION_STATUS=${session.status}`;
  return "UNKNOWN";
}

async function main() {
  loadEnv();
  console.log(`[ios-missed] kind=${KIND} waitMs=${WAIT_MS}`);
  fs.writeFileSync(SYSLOG, "");
  const prep = await prepareLocked();
  startIosSyslogCapture({ udid: IOS_UDID, outPath: SYSLOG, pidPath: SYSLOG_PID });
  await sleep(1000);
  const offset = fs.existsSync(SYSLOG) ? fs.statSync(SYSLOG).size : 0;

  const { browser, page } = await ensureCaller();
  const placed = await placeCall(page, KIND);
  console.log(`[ios-missed] placed callId=${placed.callId} status=${placed.status}`);
  if (!placed.callId) {
    stopIosSyslogCapture(IOS_UDID);
    throw new Error("no_call_id");
  }

  // Natural expire — do NOT launch accept deeplink, do NOT reject
  const t0 = Date.now();
  let session = null;
  while (Date.now() - t0 < WAIT_MS) {
    session = await fetchSession(placed.callId);
    if (session && ["missed", "cancelled", "ended", "rejected", "failed"].includes(session.status)) break;
    await sleep(3000);
  }
  session = session || (await fetchSession(placed.callId));
  await sleep(3000);

  const merged = mergeIosLogSources({
    slice: fs.existsSync(SYSLOG) ? fs.readFileSync(SYSLOG, "utf8").slice(offset) : "",
    udid: IOS_UDID,
    minutes: 5,
  });
  // also append full syslog file for native video NSLog
  const fullSys = fs.existsSync(SYSLOG) ? fs.readFileSync(SYSLOG, "utf8").slice(offset) : "";
  const obs = analyze(merged + "\n" + fullSys, placed.callId, KIND);
  const caseId = classify(obs, session);

  const report = {
    HEAD: spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", cwd: ROOT }).stdout.trim(),
    WORKTREE: "DIRTY — iOS eligibility fix PRESERVED",
    CODE_CHANGE: "NONE this classification",
    KIND,
    DEVICE: "iPhonebk",
    UDID: IOS_UDID,
    STATE: "LOCKED",
    ROOM_ID: ROOM,
    CALL_ID: placed.callId,
    prep,
    placedAt: placed.placedAt,
    WAIT_MS,
    VoIP_push: obs.voipIncoming ? "PASS" : "FAIL",
    CallKit_presented: obs.callkitReport ? "PASS" : "FAIL",
    ringing_started: obs.callkitReport ? "PASS" : "FAIL",
    local_missed_timer_armed: obs.timerArmedExact ? "YES" : KIND === "video" ? "UNKNOWN_NO_SCHEDULE_LOG" : "NO",
    timer_deadline_local_sec: 30,
    timer_fired_propose: obs.proposeLine ? "YES" : "NO",
    propose_line: obs.proposeLine,
    early_reject: obs.earlyRejectLine,
    missedAsync_inferred: obs.proposeLine || obs.earlyRejectLine || obs.failedLine || obs.dismissLine ? "YES" : "NO",
    server_session: session,
    session_final_status: session?.status || null,
    ended_reason: session?.ended_reason || null,
    started_at: session?.started_at || null,
    ended_at: session?.ended_at || null,
    terminal_missed_voip: obs.missedVoipLine ? "YES" : "NO",
    missed_voip_line: obs.missedVoipLine,
    local_dismiss_after_server_ok: obs.dismissLine ? "YES" : "NO",
    dismiss_line: obs.dismissLine,
    CallKit_end_reason_hint: obs.unansweredLine
      ? "unanswered"
      : obs.callkitEndLine
        ? "other_or_unparsed"
        : "none",
    unanswered_line: obs.unansweredLine,
    callkit_end_line: obs.callkitEndLine,
    accept_contamination: obs.acceptContamination ? "YES" : "NO",
    CASE: caseId,
    MISSED_RUNTIME:
      session?.status === "missed" &&
      !obs.acceptContamination &&
      (obs.dismissLine || obs.unansweredLine || obs.missedVoipLine)
        ? "PASS_CANDIDATE"
        : "FAIL_OR_INCOMPLETE",
    sample: obs.sample,
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        callId: report.CALL_ID,
        status: report.session_final_status,
        reason: report.ended_reason,
        CASE: report.CASE,
        propose: !!obs.proposeLine,
        early: !!obs.earlyRejectLine,
        dismiss: !!obs.dismissLine,
        missedVoip: !!obs.missedVoipLine,
        acceptContamination: obs.acceptContamination,
      },
      null,
      2,
    ),
  );
  console.log(`[ios-missed] wrote ${OUT}`);

  // cleanup if still ringing
  if (session?.status === "ringing") await cancelCall(page, placed.callId);
  stopIosSyslogCapture(IOS_UDID);
  await browser.close().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  try {
    stopIosSyslogCapture(IOS_UDID);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
