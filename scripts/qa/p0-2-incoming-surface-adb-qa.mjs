#!/usr/bin/env node
/**
 * P0-2 incoming call surface dedup — adb 2-device QA (production Vercel WebView).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const ACT = `${PKG}/.MainActivity`;
const SERIAL_A = process.env.P0_DEVICE_A?.trim() || "8b37179f7d94";
const SERIAL_B = process.env.P0_DEVICE_B?.trim() || "RFCY40PY2CA";
const PEER_QQQQ = process.env.P4_PEER_USER_ID?.trim() || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const PROD = "https://samarket.vercel.app";

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" }).stdout ?? "";
}

function adbFull(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function wake(serial) {
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "input", "keyevent", "82");
}

function logcatClear(serial) {
  adb(serial, "logcat", "-c");
}

function logcatDump(serial) {
  return adb(serial, "logcat", "-d");
}

function logcatGrep(serial, pattern) {
  const r = adbFull(serial, "logcat", "-d");
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const re = new RegExp(pattern, "gi");
  return text.split("\n").filter((l) => re.test(l));
}

async function openRoute(serial, dibayPath) {
  adbFull(serial, "shell", "am", "start", "-n", ACT, "-a", "android.intent.action.VIEW", "-d", dibayPath);
  await sleep(600);
}

async function openCall(serial, sessionId, query = "") {
  const q = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  await openRoute(serial, `dibay://call/${encodeURIComponent(sessionId)}${q}`);
}

async function restartApp(serial) {
  adb(serial, "shell", "am", "force-stop", PKG);
  await sleep(400);
  adbFull(serial, "shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
  await sleep(5000);
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
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function signInEmail(email) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const password = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message ?? "no session"}`);
  return data.session;
}

async function resolveUserId(login) {
  const email = login.includes("@") ? login : `${login}@manual.local`;
  const session = await signInEmail(email);
  return String(session.user.id);
}

function supabaseAdmin() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return createClient(url, key, { auth: { persistSession: false } });
}

async function waitCallIdDb(initiatorId, recipientId, sinceIso, timeoutMs = 60_000) {
  const sb = supabaseAdmin();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await sb
      .from("community_messenger_call_sessions")
      .select("id, status, created_at")
      .eq("initiator_user_id", initiatorId)
      .eq("recipient_user_id", recipientId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data;
    await sleep(1500);
  }
  return null;
}

async function patchCall(callId, action) {
  const sb = supabaseAdmin();
  const { data: row } = await sb.from("community_messenger_call_sessions").select("*").eq("id", callId).maybeSingle();
  if (!row) return false;
  const res = await fetch(`${PROD}/api/community-messenger/calls/sessions/${encodeURIComponent(callId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return res.ok;
}

async function startOutgoingCall(initiatorId, recipientId) {
  logcatClear(SERIAL_A);
  logcatClear(SERIAL_B);
  const sinceIso = new Date(Date.now() - 2000).toISOString();
  wake(SERIAL_A);
  const tmp = `tmp_p02_${Date.now()}`;
  await openCall(SERIAL_A, tmp, `kind=voice&peerUserId=${encodeURIComponent(recipientId)}`);
  const row = await waitCallIdDb(initiatorId, recipientId, sinceIso, 75_000);
  return row;
}

function analyzeLogs(logA, logB, callId) {
  const merged = `${logA}\n${logB}`;
  const has = (p) => new RegExp(p, "i").test(merged);
  const count = (p) => (merged.match(new RegExp(p, "gi")) ?? []).length;
  return {
    nativeFullscreen: has("native_fullscreen|IncomingCallActivity"),
    foregroundPill: has("native_foreground_pill|ForegroundIncomingCallActivity"),
    webBanner: has("web_foreground_overlay|GlobalIncoming|foreground_incoming"),
    callScreenRoute: has(`/community-messenger/calls/${callId}|dibay://call/${callId}`),
    routeBlock: has("stale_call_route|pending_route_blocked|ringing_only|isRingingOnly"),
    surfaceClaimed: has("surface_claimed"),
    surfaceBlocked: has("surface_claim_blocked"),
    surfaceConsumed: has("surface_consumed|terminal_suppressed"),
    staleRingingBlocked: has("stale_ringing_blocked|recovery_ringing"),
    acceptPatch: count("accept_patch|PATCH.*accept|patch.*accept"),
    duplicateModalRisk: has("IncomingCallActivity") && has("webview_page_started url=.*/community-messenger/calls/") && !has("nativeAccept=1|action=accept"),
  };
}

async function tapUi(serial, texts) {
  adb(serial, "shell", "uiautomator", "dump", "/sdcard/p02_uidump.xml");
  const pull = adbFull(serial, "pull", "/sdcard/p02_uidump.xml", `/tmp/p02_uidump_${serial}.xml`);
  if (pull.status !== 0) return false;
  const xml = fs.readFileSync(`/tmp/p02_uidump_${serial}.xml`, "utf8");
  for (const t of texts) {
    const re = new RegExp(`(?:text="${t}"|content-desc="${t}")[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, "i");
    const m = xml.match(re) ?? xml.match(new RegExp(`bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*(?:text="${t}"|content-desc="${t}")`, "i"));
    if (m) {
      const x = Math.floor((+m[1] + +m[3]) / 2);
      const y = Math.floor((+m[2] + +m[4]) / 2);
      adb(serial, "shell", "input", "tap", String(x), String(y));
      await sleep(800);
      return true;
    }
  }
  return false;
}

async function runScenario(scenario, initiatorId, recipientId) {
  const row = { id: scenario.id, name: scenario.name, pass: false, callId: null, evidence: {}, notes: [] };
  await scenario.setup?.();
  const session = await startOutgoingCall(initiatorId, recipientId);
  row.callId = session?.id ?? null;
  if (!row.callId) {
    row.notes.push("no callId from DB");
    return row;
  }
  await sleep(scenario.ringWaitMs ?? 8000);
  await scenario.action?.(row.callId);
  await sleep(scenario.postActionMs ?? 6000);
  const logA = logcatDump(SERIAL_A);
  const logB = logcatDump(SERIAL_B);
  row.evidence = analyzeLogs(logA, logB, row.callId);
  row.pass = scenario.judge(row.evidence, row);
  if (!row.pass) row.notes.push("judge failed");
  await scenario.teardown?.(row.callId);
  return row;
}

async function main() {
  loadEnvLocal();
  const initiatorId = await resolveUserId("aaaa");
  const recipientId = PEER_QQQQ.includes("-") ? PEER_QQQQ : await resolveUserId("qqqq");
  console.log(`[p0-2] A=${SERIAL_A} B=${SERIAL_B} initiator=${initiatorId.slice(0, 8)} recipient=${recipientId.slice(0, 8)}`);

  for (const perm of ["android.permission.RECORD_AUDIO", "android.permission.CAMERA", "android.permission.POST_NOTIFICATIONS"]) {
    adb(SERIAL_A, "shell", "pm", "grant", PKG, perm);
    adb(SERIAL_B, "shell", "pm", "grant", PKG, perm);
  }

  console.log("[p0-2] restart apps + origin check");
  await restartApp(SERIAL_A);
  await restartApp(SERIAL_B);
  const originA = logcatGrep(SERIAL_A, "capacitor_server_url|Loading app at").slice(-2);
  const originB = logcatGrep(SERIAL_B, "capacitor_server_url|Loading app at").slice(-2);
  console.log("[p0-2] origin A:", originA.join(" | ") || "missing");
  console.log("[p0-2] origin B:", originB.join(" | ") || "missing");

  const scenarios = [
    {
      id: "A",
      name: "background receive",
      setup: async () => {
        wake(SERIAL_B);
        await openRoute(SERIAL_B, "dibay://community-messenger?section=chats");
        await sleep(2000);
        adb(SERIAL_B, "shell", "input", "keyevent", "3");
        await sleep(1000);
      },
      ringWaitMs: 10000,
      judge: (e) => e.nativeFullscreen && !e.duplicateModalRisk && (e.surfaceClaimed || e.routeBlock),
    },
    {
      id: "B",
      name: "lock screen receive",
      setup: async () => {
        wake(SERIAL_B);
        adb(SERIAL_B, "shell", "input", "keyevent", "26");
        await sleep(800);
      },
      ringWaitMs: 10000,
      postActionMs: 3000,
      teardown: async () => {
        adb(SERIAL_B, "shell", "input", "keyevent", "26");
        await sleep(500);
      },
      judge: (e) => e.nativeFullscreen && !e.duplicateModalRisk,
    },
    {
      id: "C",
      name: "foreground receive",
      setup: async () => {
        wake(SERIAL_B);
        await openRoute(SERIAL_B, "dibay://community-messenger?section=chats");
        await sleep(2500);
      },
      ringWaitMs: 9000,
      judge: (e) => (e.foregroundPill || e.webBanner) && !(e.foregroundPill && e.webBanner) && !e.duplicateModalRisk,
    },
    {
      id: "D",
      name: "native accept",
      setup: async () => {
        wake(SERIAL_B);
        adb(SERIAL_B, "shell", "input", "keyevent", "3");
        await sleep(800);
      },
      ringWaitMs: 8000,
      action: async () => {
        wake(SERIAL_B);
        await tapUi(SERIAL_B, ["수락", "Accept", "accept"]);
        await sleep(6000);
      },
      postActionMs: 4000,
      judge: (e, row) => e.surfaceConsumed || /active/.test(JSON.stringify(row)),
    },
    {
      id: "E",
      name: "caller cancel",
      ringWaitMs: 6000,
      action: async (callId) => {
        await patchCall(callId, "cancel");
        await sleep(4000);
      },
      judge: (e) => e.surfaceConsumed,
    },
    {
      id: "F",
      name: "callee reject",
      setup: async () => adb(SERIAL_B, "shell", "input", "keyevent", "3"),
      ringWaitMs: 8000,
      action: async () => {
        wake(SERIAL_B);
        await tapUi(SERIAL_B, ["거절", "Decline", "reject"]);
        await sleep(4000);
      },
      judge: (e) => e.surfaceConsumed,
    },
    {
      id: "G",
      name: "missed timeout",
      setup: async () => adb(SERIAL_B, "shell", "input", "keyevent", "3"),
      ringWaitMs: 45000,
      judge: (e) => e.surfaceConsumed || e.staleRingingBlocked,
    },
    {
      id: "H",
      name: "recovery ringing block",
      setup: async () => adb(SERIAL_B, "shell", "input", "keyevent", "3"),
      ringWaitMs: 5000,
      action: async () => {
        adb(SERIAL_B, "shell", "am", "force-stop", PKG);
        await sleep(1500);
        await restartApp(SERIAL_B);
        await sleep(6000);
      },
      postActionMs: 3000,
      judge: (e) => !e.callScreenRoute || e.staleRingingBlocked,
    },
  ];

  const results = [];
  for (const sc of scenarios) {
    console.log(`\n[p0-2] scenario ${sc.id}: ${sc.name}`);
    try {
      const r = await runScenario(sc, initiatorId, recipientId);
      results.push(r);
      console.log(JSON.stringify({ id: r.id, pass: r.pass, callId: r.callId, evidence: r.evidence, notes: r.notes }, null, 0));
      await sleep(3000);
    } catch (e) {
      results.push({ id: sc.id, name: sc.name, pass: false, notes: [String(e)] });
      console.log(`[p0-2] scenario ${sc.id} ERROR`, e);
    }
  }

  const repeat = [];
  const combos = [
    ["A", "background"],
    ["C", "foreground"],
    ["E", "cancel"],
    ["F", "reject"],
    ["A", "background"],
    ["C", "foreground"],
    ["E", "cancel"],
    ["F", "reject"],
    ["A", "background"],
    ["C", "foreground"],
  ];
  for (let i = 0; i < combos.length; i++) {
    const [kind] = combos[i];
    const sc = scenarios.find((s) => s.id === kind);
    if (!sc) continue;
    console.log(`\n[p0-2] repeat ${i + 1}/10 kind=${kind}`);
    try {
      const r = await runScenario(sc, initiatorId, recipientId);
      repeat.push({ n: i + 1, id: kind, pass: r.pass, duplicateModalRisk: r.evidence?.duplicateModalRisk });
    } catch (e) {
      repeat.push({ n: i + 1, id: kind, pass: false, error: String(e) });
    }
    await sleep(2500);
  }

  const out = { results, repeat, passCount: results.filter((r) => r.pass).length, repeatPass: repeat.filter((r) => r.pass).length };
  fs.writeFileSync("/tmp/p0-2-surface-qa-report.json", JSON.stringify(out, null, 2));
  console.log("\n[p0-2] REPORT /tmp/p0-2-surface-qa-report.json");
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
