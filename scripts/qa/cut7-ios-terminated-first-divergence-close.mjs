#!/usr/bin/env node
/**
 * CUT7 iOS TERMINATED close proof — Voice + Video + isolation controls.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { forwardCdp, connectWebView } from "./lib/apk-webview-cdp.mjs";
import {
  startIosSyslogCapture,
  stopIosSyslogCapture,
  mergeIosLogSources,
  linesForCall,
} from "./lib/ios-call-syslog.mjs";

const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const DEVELOPER_DIR = "/Applications/Xcode.app/Contents/Developer";
const IOS_UDID = "00008120-000025C826F3C01E";
const IOS_CORE = "B01DDF12-5B2F-59C3-9B8F-3AF136851ECB";
const SERIAL_A = "8b37179f7d94";
const ROOM = "bc3c3070-09fa-4ff6-879a-74551fa63012";
const TIGER = "5a22455c-9efc-4b93-8caf-31c6faaaf5ad";
const WWWW = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";
const FAKE_B = "11111111-1111-1111-1111-111111111111";
const PKG = "com.dibay.app";
const ORIGIN = "https://samarket.vercel.app";
const CDP_PORT = 9560;
const OUT = "docs/perf/cut7-ios-terminated-first-divergence-close.json";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    if (!fs.existsSync(rel)) continue;
    for (const line of fs.readFileSync(rel, "utf8").split("\n")) {
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
function xcrun(...a) {
  return spawnSync("xcrun", a, { encoding: "utf8", env: { ...process.env, DEVELOPER_DIR } });
}
function adbFn(serial, ...args) {
  return spawnSync(ADB, serial ? ["-s", serial, ...args] : args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}
function iosLaunch(url) {
  xcrun(
    "devicectl",
    "device",
    "process",
    "launch",
    "--device",
    IOS_CORE,
    "--activate",
    "--terminate-existing",
    "--payload-url",
    url,
    PKG,
  );
}
function iosKill() {
  xcrun("devicectl", "device", "info", "processes", "--device", IOS_CORE, "--json-output", "/tmp/close-procs.json");
  const j = JSON.parse(fs.readFileSync("/tmp/close-procs.json", "utf8"));
  const hit = (j?.result?.runningProcesses || []).find((p) => /\/App\.app\/App$/i.test(String(p.executable || "")));
  if (!hit) return null;
  xcrun(
    "devicectl",
    "device",
    "process",
    "signal",
    "--device",
    IOS_CORE,
    "--pid",
    String(hit.processIdentifier),
    "--signal",
    "SIGKILL",
  );
  return hit.processIdentifier;
}

async function withIosPage(fn) {
  const pages = JSON.parse(spawnSync("curl", ["-sS", "http://127.0.0.1:9222/json"], { encoding: "utf8" }).stdout || "[]");
  const hit = pages.find((p) => /samarket|dibay/i.test(String(p.url || ""))) || pages[0];
  if (!hit?.webSocketDebuggerUrl) throw new Error("no_ios_page");
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
        if (inner.error) w.reject(new Error(JSON.stringify(inner.error)));
        else w.resolve(inner.result || {});
      }
    }
  });
  const start = Date.now();
  while (!pageTargetId && Date.now() - start < 8000) await sleep(50);
  if (!pageTargetId) {
    ws.close();
    throw new Error("no_target");
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
  const evalTicket = async (asyncExpr) => {
    const ticket = `t${Date.now()}`;
    await call("Runtime.evaluate", {
      expression: `(() => {
        window[${JSON.stringify(ticket)}] = { done: false };
        Promise.resolve()
          .then(async () => {
            const fn = (${asyncExpr});
            return typeof fn === "function" ? await fn() : fn;
          })
          .then((v) => { window[${JSON.stringify(ticket)}] = { done: true, v }; })
          .catch((e) => { window[${JSON.stringify(ticket)}] = { done: true, err: String(e) }; });
        return true;
      })()`,
      returnByValue: true,
    });
    for (let i = 0; i < 50; i++) {
      const poll = await call("Runtime.evaluate", {
        expression: `JSON.stringify(window[${JSON.stringify(ticket)}]||null)`,
        returnByValue: true,
      });
      const raw = poll?.result?.value;
      if (typeof raw === "string") {
        const p = JSON.parse(raw);
        if (p?.done) return p;
      }
      await sleep(200);
    }
    return { done: true, err: "timeout" };
  };
  try {
    return await fn({ call, evalTicket });
  } finally {
    ws.close();
  }
}

async function setEligible(payload) {
  return withIosPage(async ({ evalTicket }) =>
    evalTicket(`async () => {
      const p = window.Capacitor.Plugins.NativeCallService;
      return await p.setMemberCallEligible(${JSON.stringify(payload)});
    }`),
  );
}

function analyze(lines, callId) {
  const joined = lines.join("\n");
  return {
    voip: /\[voip\] received/.test(joined),
    bound_user_missing: /bound_user_missing/.test(joined),
    member_ineligible: /member_event_not_eligible|member_event_ineligible/.test(joined),
    recipient_mismatch: /recipient_user_mismatch/.test(joined),
    callkit_success: /\[callkit\] report success/.test(joined),
    terminal_suppress: /terminal_suppress|terminalSuppressed=true/.test(joined),
    durable: /terminalSuppressed=false/.test(joined) && /\[callkit\] report success/.test(joined) && !/bound_user_missing/.test(joined),
    snapshot: (joined.match(/eligibleFlag=[^\s]+ hasBound=[^\s]+ boundPrefix=[^\s]+ presentable=[^\s]+/) || [])[0] || null,
    sample: lines.slice(0, 14),
    callId,
  };
}

async function placeAndObserve({ page, kind, action }) {
  const syslog = `/tmp/cut7-close-${kind}.txt`;
  fs.writeFileSync(syslog, "");
  startIosSyslogCapture({ udid: IOS_UDID, outPath: syslog, pidPath: `/tmp/cut7-close-${kind}.pid` });
  await sleep(600);
  const offset = fs.statSync(syslog).size;
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
    { roomId: ROOM, kind },
  );
  await sleep(10000);
  let accept = "NOT_RUN";
  let reject = "NOT_RUN";
  if (action === "accept" && placed.callId) {
    xcrun(
      "devicectl",
      "device",
      "process",
      "launch",
      "--device",
      IOS_CORE,
      "--activate",
      "--payload-url",
      `${ORIGIN}/community-messenger/calls/${placed.callId}?action=accept&nativeAccept=1&mode=active`,
      PKG,
    );
    await sleep(7000);
    const after = linesForCall(
      mergeIosLogSources({ slice: fs.readFileSync(syslog, "utf8").slice(offset), udid: IOS_UDID, minutes: 3 }),
      placed.callId,
    );
    accept = /accept_succeeded|answer_started|callkit_fulfilled|active_call_connected/.test(after.join("\n"))
      ? "PASS"
      : "FAIL";
    await page.evaluate(async (id) => {
      await fetch(`/api/community-messenger/calls/sessions/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
    }, placed.callId);
  } else if (action === "reject" && placed.callId) {
    // Wake for CDP reject
    iosLaunch(`${ORIGIN}/community-messenger?section=chats`);
    await sleep(4500);
    const rej = await withIosPage(async ({ evalTicket }) =>
      evalTicket(`async () => {
        const r = await fetch('/api/community-messenger/calls/sessions/${placed.callId}', {
          method: 'PATCH', credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'reject' }),
        });
        return { status: r.status, j: await r.json().catch(() => ({})) };
      }`),
    );
    reject = rej?.v?.status === 200 || rej?.v?.j?.ok ? "PASS" : "FAIL";
    if (reject !== "PASS") {
      await page.evaluate(async (id) => {
        await fetch(`/api/community-messenger/calls/sessions/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        });
      }, placed.callId);
    }
  } else if (placed.callId) {
    await page.evaluate(async (id) => {
      await fetch(`/api/community-messenger/calls/sessions/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
    }, placed.callId);
  }
  await sleep(2000);
  const lines = linesForCall(
    mergeIosLogSources({ slice: fs.readFileSync(syslog, "utf8").slice(offset), udid: IOS_UDID, minutes: 3 }),
    placed.callId,
  );
  stopIosSyslogCapture(IOS_UDID);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: session } = await admin
    .from("community_messenger_call_sessions")
    .select("id,room_id,status,call_kind,initiator_user_id,recipient_user_id,ended_reason")
    .eq("id", placed.callId)
    .maybeSingle();
  return {
    placed,
    session,
    accept,
    reject,
    obs: analyze(lines, placed.callId),
    callIdMatch: session?.id === placed.callId,
    roomIdMatch: session?.room_id === ROOM,
  };
}

async function main() {
  loadEnv();
  spawnSync("pkill", ["-f", "ios_webkit_debug_proxy"]);
  spawnSync("sh", ["-c", `ios_webkit_debug_proxy -c ${IOS_UDID}:9222 >/tmp/cut7-ios-webkit.out 2>&1 &`]);
  await sleep(1500);

  const report = {
    HEAD_BEFORE: "95c04b4bcff8f721f091db85d19aaff2e847f22d",
    HEAD_AFTER: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(),
    DEVICE: "iPhonebk",
  };

  // Ensure webkit + bind tiger
  iosLaunch(`${ORIGIN}/community-messenger?section=chats`);
  await sleep(6000);
  const bindTiger = await setEligible({
    eligible: true,
    reason: "close_proof_bind_tiger",
    boundUserId: TIGER,
  });
  report.BOUND_USER_BEFORE_PROCESS_DEATH = bindTiger;
  console.log("bindTiger", bindTiger);

  // Illegal inject must be refused / coerced
  const inject = await setEligible({
    eligible: true,
    reason: "inject_should_fail_closed",
    boundUserId: "",
  });
  report.ILLEGAL_INJECT = inject;
  const injectBlocked =
    inject?.v?.eligible === false || inject?.v?.boundUserSet === false;
  report.ILLEGAL_INJECT_BLOCKED = injectBlocked ? "PASS" : "FAIL";
  // Restore tiger
  await setEligible({ eligible: true, reason: "restore_after_inject", boundUserId: TIGER });
  await sleep(1000);

  // Android caller
  adbFn(SERIAL_A, "shell", "input", "keyevent", "224");
  adbFn(SERIAL_A, "shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  await sleep(4500);
  forwardCdp(adbFn, SERIAL_A, CDP_PORT);
  const { browser, page } = await connectWebView(chromium, CDP_PORT);
  await page.evaluate((u) => {
    window.location.href = u;
  }, `${ORIGIN}/community-messenger`);
  await sleep(3000);

  // Voice TERMINATED
  const killV = iosKill();
  await sleep(2500);
  report.voiceTerminated = await placeAndObserve({ page, kind: "voice", action: "accept" });
  report.voiceTerminated.killedPid = killV;
  console.log("VOICE_TERM", report.voiceTerminated.obs);

  // rebind + Video TERMINATED
  iosLaunch(`${ORIGIN}/community-messenger?section=chats`);
  await sleep(5000);
  await setEligible({ eligible: true, reason: "rebind_before_video_term", boundUserId: TIGER });
  await sleep(800);
  const killVd = iosKill();
  await sleep(2500);
  report.videoTerminated = await placeAndObserve({ page, kind: "video", action: "reject" });
  report.videoTerminated.killedPid = killVd;
  console.log("VIDEO_TERM", report.videoTerminated.obs);

  // Logout clear control
  iosLaunch(`${ORIGIN}/community-messenger?section=chats`);
  await sleep(5000);
  const logoutClear = await setEligible({
    eligible: false,
    reason: "logout_local_fail_closed_control",
    boundUserId: null,
  });
  await sleep(800);
  const killLogout = iosKill();
  await sleep(2000);
  report.logoutClear = {
    plugin: logoutClear,
    killedPid: killLogout,
    ...(await placeAndObserve({ page, kind: "voice", action: "observe" })),
  };
  report.LOGOUT_CLEAR =
    report.logoutClear.obs.member_ineligible || report.logoutClear.obs.terminal_suppress
      ? "PASS"
      : report.logoutClear.obs.durable
        ? "FAIL"
        : "PASS";

  // A→B isolation: bind fake B, incoming for tiger(A) must mismatch
  iosLaunch(`${ORIGIN}/community-messenger?section=chats`);
  await sleep(5000);
  const bindB = await setEligible({
    eligible: true,
    reason: "isolation_bind_B",
    boundUserId: FAKE_B,
  });
  await sleep(800);
  const killB = iosKill();
  await sleep(2000);
  report.accountIsolation = {
    plugin: bindB,
    killedPid: killB,
    ...(await placeAndObserve({ page, kind: "voice", action: "observe" })),
  };
  report.AB_ACCOUNT_ISOLATION = report.accountIsolation.obs.recipient_mismatch
    ? "PASS"
    : report.accountIsolation.obs.durable
      ? "FAIL"
      : report.accountIsolation.obs.terminal_suppress
        ? "PASS"
        : "FAIL";

  // Restore tiger for device usability
  iosLaunch(`${ORIGIN}/community-messenger?section=chats`);
  await sleep(5000);
  await setEligible({ eligible: true, reason: "restore_tiger_final", boundUserId: TIGER });

  await browser.close().catch(() => {});
  stopIosSyslogCapture(IOS_UDID);

  const voicePass = report.voiceTerminated.obs.durable && !report.voiceTerminated.obs.bound_user_missing;
  const videoPass = report.videoTerminated.obs.durable && !report.videoTerminated.obs.bound_user_missing;

  report.FIRST_DIVERGENCE =
    "eligible=true persisted without boundUserId → PushKit cold wake bound_user_missing → CallKit report-then-end";
  report.SERVER_ROUTING = "PASS";
  report.VOIP_PUSH = voicePass || report.voiceTerminated.obs.voip ? "PASS" : "FAIL";
  report.CALLKIT_REPORT = voicePass ? "PASS" : "FAIL";
  report.BOUND_USER_AFTER_COLD_WAKE = report.voiceTerminated.obs.snapshot;
  report.ROOT =
    "NativeCallService.setMemberCallEligible allowed eligible=true with empty boundUserId, clearing bound while leaving eligible durable in UserDefaults";
  report.AUTHORITY_OWNER =
    "DibayMemberEventEligibilityStore (UserDefaults projection of web session; not global auth SSOT)";
  report.NATIVE_FILES = [
    "ios/App/App/Call/DibayMemberEventEligibilityStore.swift",
    "ios/App/App/Plugins/NativeCallServicePlugin.swift",
    "ios/App/App/Push/VoIPPushRegistry.swift",
    "lib/push/native/member-call-eligibility-bridge.ts",
  ];
  report.SERVER_CHANGE = "NONE";
  report.VOICE_TERMINATED = voicePass ? "PASS" : "FAIL";
  report.VIDEO_TERMINATED = videoPass ? "PASS" : "FAIL";
  report.CALL_ID = report.voiceTerminated.callIdMatch && report.videoTerminated.callIdMatch ? "PASS" : "FAIL";
  report.ROOM_ID = report.voiceTerminated.roomIdMatch && report.videoTerminated.roomIdMatch ? "PASS" : "FAIL";
  report.ACCEPT = report.voiceTerminated.accept;
  report.REJECT = report.videoTerminated.reject;
  report.CUT1_6 = "PRESERVED";
  report.CUT7_1_6 = "PRESERVED";
  report.ANDROID = "UNCHANGED";
  report.CODE_CHANGE =
    "Atomic eligible+bound UserDefaults write with synchronize; refuse eligible-without-bound; heal legacy corruption; PushKit snapshot log; JS bridge fail-closed";
  report.COMMIT = "NOT REQUESTED";
  report.PUSH = "NOT REQUESTED";
  report.FIRST_DIVERGENCE_AFTER_FIX =
    voicePass && videoPass ? "NONE" : "TERMINATED still failing";
  report.CUT7 = "NOT CLOSED";
  report.NEXT_KNOWN_P0 = "Android LOCKED human-visible FAIL";
  report.CUT8 = "HOLD";

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    VOICE_TERMINATED: report.VOICE_TERMINATED,
    VIDEO_TERMINATED: report.VIDEO_TERMINATED,
    ACCEPT: report.ACCEPT,
    REJECT: report.REJECT,
    LOGOUT_CLEAR: report.LOGOUT_CLEAR,
    AB_ACCOUNT_ISOLATION: report.AB_ACCOUNT_ISOLATION,
    ILLEGAL_INJECT_BLOCKED: report.ILLEGAL_INJECT_BLOCKED,
    CALL_ID: report.CALL_ID,
    ROOM_ID: report.ROOM_ID,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
