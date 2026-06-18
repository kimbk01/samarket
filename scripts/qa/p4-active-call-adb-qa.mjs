#!/usr/bin/env node
/**
 * P4 Active Call — adb-only 2-device QA (aaaa caller / qqqq callee).
 * Usage: node scripts/qa/p4-active-call-adb-qa.mjs
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
const SERIAL_A = process.env.P4_DEVICE_A?.trim() || "8b37179f7d94"; // aaaa / Xiaomi
const SERIAL_B = process.env.P4_DEVICE_B?.trim() || "RFCY40PY2CA"; // qqqq / Samsung
const PERF = path.join(ROOT, "docs/perf");
const PEER_QQQQ = process.env.P4_PEER_USER_ID?.trim() || "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";

function lanOrigin() {
  const port = process.env.QA_SERVER_PORT?.trim() || process.env.PORT?.trim() || "3000";
  const ip =
    spawnSync("ipconfig", ["getifaddr", "en0"], { encoding: "utf8" }).stdout?.trim() ||
    spawnSync("ipconfig", ["getifaddr", "en1"], { encoding: "utf8" }).stdout?.trim() ||
    "192.168.100.64";
  return `http://${ip}:${port}`;
}

function adb(serial, ...args) {
  const r = spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
  return r.stdout ?? "";
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

async function wakeAsync(serial) {
  wake(serial);
  await sleep(300);
}

async function openRoute(serial, dibayPath) {
  adbFull(serial, "shell", "am", "start", "-n", ACT, "-a", "android.intent.action.VIEW", "-d", dibayPath);
  await sleep(500);
}

async function openAppPath(serial, appPath) {
  const url = `${lanOrigin()}${appPath.startsWith("/") ? appPath : `/${appPath}`}`;
  adbFull(serial, "shell", "am", "start", "-n", ACT, "-a", "android.intent.action.VIEW", "-d", url);
  await sleep(500);
}

async function openCall(serial, sessionId, query = "") {
  const q = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  await openRoute(serial, `dibay://call/${encodeURIComponent(sessionId)}${q}`);
}

function logcatDump(serial, tags = "DIBAY_CALL") {
  return adb(serial, "logcat", "-d", "-s", tags);
}

function logcatClear(serial) {
  adb(serial, "logcat", "-c");
}

function extractCallIds(text) {
  const ids = new Set();
  for (const m of text.matchAll(/callId=([0-9a-f-]{36})/gi)) ids.add(m[1]);
  for (const m of text.matchAll(/sessionId: ([0-9a-f-]{36})/gi)) ids.add(m[1]);
  return [...ids].filter((id) => !id.startsWith("tmp"));
}

function forbiddenLines(text) {
  const patterns = [
    /active_call_cleanup callId=[^ ]+ reason=(screen_off|backgrounded|activity_destroyed|webview_reload)/,
    /background caused call ended/,
    /screen off caused agora_leave/,
    /heartbeat_patch_failed|heartbeat PATCH failed/i,
  ];
  return text.split("\n").filter((line) => patterns.some((p) => p.test(line)));
}

function hasMarker(text, marker) {
  return text.includes(marker);
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
  if (!url || !anon) throw new Error("Supabase env missing");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const password = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login failed ${email}: ${error?.message ?? "no session"}`);
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
  if (!url || !key) throw new Error("Supabase admin env missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function pollCallSession(initiatorId, recipientId, sinceIso) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("community_messenger_call_sessions")
    .select("id, status, created_at")
    .eq("initiator_user_id", initiatorId)
    .eq("recipient_user_id", recipientId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

async function waitCallIdDb(initiatorId, recipientId, sinceIso, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await pollCallSession(initiatorId, recipientId, sinceIso);
    if (row?.id) return row;
    await sleep(2000);
  }
  return null;
}

async function waitSessionActive(callId, timeoutMs = 90_000) {
  const sb = supabaseAdmin();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await sb
      .from("community_messenger_call_sessions")
      .select("id, status, caller_last_heartbeat_at, callee_last_heartbeat_at")
      .eq("id", callId)
      .maybeSingle();
    if (data?.status === "active") return true;
    await sleep(2000);
  }
  return false;
}

async function tapEndCall(serial) {
  adb(serial, "shell", "uiautomator", "dump", "/sdcard/p4_uidump.xml");
  const pull = adbFull(serial, "pull", "/sdcard/p4_uidump.xml", "/tmp/p4_uidump.xml");
  if (pull.status !== 0 || !fs.existsSync("/tmp/p4_uidump.xml")) return false;
  const xml = fs.readFileSync("/tmp/p4_uidump.xml", "utf8");
  const nodes = [...xml.matchAll(/<node[^>]*(?:text="(종료|End)"|content-desc="(종료|End)")[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)];
  if (nodes.length === 0) {
    const loose = [...xml.matchAll(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*(?:text="(종료|End)"|content-desc="(종료|End)")/g)];
    if (loose.length === 0) return false;
    const m = loose[0];
    const x = Math.floor((+m[1] + +m[3]) / 2);
    const y = Math.floor((+m[2] + +m[4]) / 2);
    adb(serial, "shell", "input", "tap", String(x), String(y));
    return true;
  }
  const m = nodes[0];
  const x1 = +m[3],
    y1 = +m[4],
    x2 = +m[5],
    y2 = +m[6];
  adb(serial, "shell", "input", "tap", String(Math.floor((x1 + x2) / 2)), String(Math.floor((y1 + y2) / 2)));
  await sleep(500);
  return true;
}

async function waitConnected(serialA, serialB, callId, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const merged = `${logcatDump(serialA)}\n${logcatDump(serialB)}`;
    if (
      hasMarker(merged, `active_call_connected callId=${callId}`) ||
      hasMarker(merged, `active_call_foreground_service_started callId=${callId}`) ||
      hasMarker(merged, `foreground_service_started callId=${callId}`)
    ) {
      return true;
    }
    await sleep(2000);
  }
  return false;
}

async function waitCallId(serialA, exclude = new Set(), timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ids = extractCallIds(logcatDump(serialA)).filter((id) => !exclude.has(id));
    if (ids.length > 0) return ids[ids.length - 1];
    await sleep(1500);
  }
  return null;
}

async function startCall(kind, initiatorId, recipientId, usedCallIds) {
  logcatClear(SERIAL_A);
  logcatClear(SERIAL_B);
  const sinceIso = new Date().toISOString();
  wake(SERIAL_B);
  await openAppPath(SERIAL_B, "/community-messenger?section=chats");
  await sleep(3000);
  wake(SERIAL_A);
  const tmp = `tmp_p4_${Date.now()}`;
  await openCall(SERIAL_A, tmp, `kind=${encodeURIComponent(kind)}&peerUserId=${encodeURIComponent(recipientId)}`);
  const row = await waitCallIdDb(initiatorId, recipientId, sinceIso);
  const callId = row?.id ?? null;
  if (!callId || usedCallIds.has(callId)) return null;
  wake(SERIAL_B);
  await openCall(SERIAL_B, callId, "action=accept&nativeAccept=1");
  await sleep(8000);
  return callId;
}

async function runScenario(scenario, initiatorId, recipientId, usedCallIds) {
  const row = { id: scenario.id, name: scenario.name, pass: false, callId: null, notes: [] };
  const callId = await startCall(scenario.kind, initiatorId, recipientId, usedCallIds);
  row.callId = callId;
  if (!callId) {
    row.notes.push("no callId");
    return row;
  }
  usedCallIds.add(callId);

  const connected = (await waitSessionActive(callId)) || (await waitConnected(SERIAL_A, SERIAL_B, callId, 30_000));
  if (!connected) row.notes.push("active_call_connected timeout");

  if (scenario.action) await scenario.action({ callId });

  await sleep(scenario.holdMs ?? 10_000);

  let logA = logcatDump(SERIAL_A);
  let logB = logcatDump(SERIAL_B);
  let forbid = [...forbiddenLines(logA), ...forbiddenLines(logB)];

  if (scenario.id !== "E" && forbid.length > 0) {
    row.notes.push(`forbidden x${forbid.length}`);
    row.forbidden = forbid.slice(0, 3);
    return row;
  }

  if (scenario.expectKeepAlive && !connected) {
    row.notes.push("never connected");
    return row;
  }

  if (scenario.endBy === "A") {
    wake(SERIAL_A);
    await openCall(SERIAL_A, callId);
    await sleep(3000);
    if (!(await tapEndCall(SERIAL_A))) row.notes.push("A end tap missed");
    await sleep(5000);
  } else if (scenario.endBy === "B") {
    wake(SERIAL_B);
    await openCall(SERIAL_B, callId);
    await sleep(3000);
    if (!(await tapEndCall(SERIAL_B))) row.notes.push("B end tap missed");
    await sleep(5000);
  }

  logA = logcatDump(SERIAL_A);
  logB = logcatDump(SERIAL_B);
  forbid = [...forbiddenLines(logA), ...forbiddenLines(logB)];

  if (scenario.id === "E") {
    const remoteOk = hasMarker(logA, "remote_ended_received");
    row.pass = remoteOk && forbid.length === 0;
    if (!remoteOk) row.notes.push("A missing remote_ended");
    return row;
  }

  if (forbid.length > 0) {
    row.notes.push(`forbidden after end x${forbid.length}`);
    return row;
  }

  row.pass = connected;
  return row;
}

async function main() {
  const initiatorId = await resolveUserId("aaaa");
  const recipientId = PEER_QQQQ.includes("-") ? PEER_QQQQ : await resolveUserId("qqqq");
  console.log(`[p4-adb] A=${SERIAL_A}(aaaa=${initiatorId.slice(0, 8)}) B=${SERIAL_B}(qqqq=${recipientId.slice(0, 8)})`);

  for (const perm of ["android.permission.RECORD_AUDIO", "android.permission.CAMERA", "android.permission.POST_NOTIFICATIONS"]) {
    adb(SERIAL_A, "shell", "pm", "grant", PKG, perm);
    adb(SERIAL_B, "shell", "pm", "grant", PKG, perm);
  }

  wake(SERIAL_A);
  wake(SERIAL_B);
  await openAppPath(SERIAL_A, "/community-messenger?section=chats");
  await openAppPath(SERIAL_B, "/community-messenger?section=chats");
  await sleep(4000);

  const usedCallIds = new Set();
  const scenarios = [
    {
      id: "A",
      name: "voice + B screen off",
      kind: "voice",
      expectKeepAlive: true,
      action: async () => {
        adb(SERIAL_B, "shell", "input", "keyevent", "26");
        await sleep(8000);
        adb(SERIAL_B, "shell", "input", "keyevent", "26");
        await sleep(2000);
      },
      endBy: "A",
    },
    {
      id: "B",
      name: "video + B screen off",
      kind: "video",
      expectKeepAlive: true,
      action: async () => {
        adb(SERIAL_B, "shell", "input", "keyevent", "26");
        await sleep(8000);
        adb(SERIAL_B, "shell", "input", "keyevent", "26");
      },
      endBy: "A",
    },
    {
      id: "C",
      name: "B home",
      kind: "voice",
      expectKeepAlive: true,
      action: async () => adb(SERIAL_B, "shell", "input", "keyevent", "3"),
      endBy: "A",
    },
    {
      id: "D",
      name: "B lock",
      kind: "voice",
      expectKeepAlive: true,
      action: async () => {
        adb(SERIAL_B, "shell", "input", "keyevent", "26");
        await sleep(8000);
        adb(SERIAL_B, "shell", "input", "keyevent", "26");
      },
      endBy: "A",
    },
    {
      id: "E",
      name: "B force-stop",
      kind: "voice",
      action: async () => adb(SERIAL_B, "shell", "am", "force-stop", PKG),
      holdMs: 8000,
      expectRemoteOnA: true,
    },
    {
      id: "F",
      name: "A ends → B remote",
      kind: "voice",
      endBy: "A",
    },
    {
      id: "G",
      name: "B ends → A remote",
      kind: "voice",
      endBy: "B",
      expectRemoteOnA: true,
    },
    {
      id: "H",
      name: "network blip B",
      kind: "voice",
      expectKeepAlive: true,
      action: async () => {
        adb(SERIAL_B, "shell", "svc", "wifi", "disable");
        await sleep(5000);
        adb(SERIAL_B, "shell", "svc", "wifi", "enable");
      },
      holdMs: 18_000,
      endBy: "A",
    },
    {
      id: "I",
      name: "re-entry",
      kind: "voice",
      endBy: "A",
    },
    {
      id: "J",
      name: "video PiP B",
      kind: "video",
      expectKeepAlive: true,
      checkPip: false,
      action: async () => {
        adb(SERIAL_B, "shell", "input", "keyevent", "3");
        await sleep(6000);
      },
      endBy: "A",
    },
  ];

  const results = [];
  for (const sc of scenarios) {
    console.log(`[p4-adb] scenario ${sc.id} — ${sc.name}`);
    try {
      if (sc.id === "E") {
        wake(SERIAL_B);
        await openAppPath(SERIAL_B, "/community-messenger?section=chats");
        await sleep(3000);
      }
      const row = await runScenario(sc, initiatorId, recipientId, usedCallIds);
      results.push(row);
      console.log(`[p4-adb] ${sc.id}: ${row.pass ? "PASS" : "FAIL"} callId=${row.callId ?? "-"} ${row.notes.join("; ")}`);
      await sleep(5000);
      if (sc.id === "E") {
        wake(SERIAL_B);
        await openAppPath(SERIAL_B, "/community-messenger?section=chats");
        await sleep(4000);
      }
    } catch (e) {
      results.push({ id: sc.id, name: sc.name, pass: false, notes: [String(e)] });
    }
  }

  const report = {
    at: new Date().toISOString(),
    mode: "adb-only",
    deviceA: { serial: SERIAL_A, account: "aaaa" },
    deviceB: { serial: SERIAL_B, account: "qqqq" },
    peerUserId: recipientId,
    initiatorUserId: initiatorId,
    results,
    passCount: results.filter((r) => r.pass).length,
    total: results.length,
  };

  fs.mkdirSync(PERF, { recursive: true });
  fs.writeFileSync(path.join(PERF, "p4-active-call-qa-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(PERF, "p4-xiaomi-logcat-qa-final.txt"), logcatDump(SERIAL_A));
  fs.writeFileSync(path.join(PERF, "p4-samsung-logcat-qa-final.txt"), logcatDump(SERIAL_B));

  console.log(`[p4-adb] ${report.passCount}/${report.total} PASS → docs/perf/p4-active-call-qa-report.json`);
  process.exit(report.passCount === report.total ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
