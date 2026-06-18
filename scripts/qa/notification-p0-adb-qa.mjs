#!/usr/bin/env node
/**
 * Notification P0 — 2-device adb QA (A=aaaa / B=qqqq).
 * Usage: node scripts/qa/notification-p0-adb-qa.mjs
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
const PROD = "https://samarket.vercel.app";
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const DIRECT_ROOM = process.env.P0_DIRECT_ROOM?.trim() || "b19e2672-f26f-4a2e-8125-52575da4a62a";
const OUT = path.join(ROOT, "docs/perf/notification-p0-adb-qa-run.log");
const TAGS = "DIBAY_FCM DIBAY_NOTIFY DIBAY_MISSED_CALL ReactNativeJS";

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

function log(line) {
  const msg = `[notification-p0-qa] ${line}`;
  console.log(msg);
  fs.appendFileSync(OUT, msg + "\n");
}

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" }).stdout ?? "";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function signInSession(login) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const email = login.includes("@") ? login : `${login}@manual.local`;
  const password = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message ?? "no session"}`);
  return data.session;
}

function supabaseAdmin() {
  loadEnvLocal();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

async function prodFetch(pathname, session, init = {}) {
  const res = await fetch(`${PROD}${pathname}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text: text.slice(0, 500) };
}

async function checkProdPreflight() {
  const badge = await fetch(`${PROD}/api/me/notifications/badge-count`);
  const badgeText = await badge.text();
  const sb = supabaseAdmin();
  const rpc = await sb.rpc("count_notification_events_badge", { p_user_id: USER_B });
  const col = await sb.from("community_messenger_presence_snapshots").select("active_room_id").limit(1);
  return {
    badgeApiStatus: badge.status,
    badgeApiBody: badgeText.slice(0, 120),
    rpcOk: !rpc.error,
    rpcError: rpc.error?.message ?? null,
    activeRoomColOk: !col.error,
    activeRoomColError: col.error?.message ?? null,
  };
}

async function sendMessage(session, preview) {
  return prodFetch(`/api/community-messenger/rooms/${DIRECT_ROOM}/messages`, session, {
    method: "POST",
    body: JSON.stringify({ content: preview, clientMessageId: `p0-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }),
  });
}

async function queryEvents(limit = 20) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("notification_events")
    .select("id,user_id,type,room_id,actor_user_id,read_at,opened_at,created_at,push_suppressed_reason,unread")
    .eq("user_id", USER_B)
    .order("created_at", { ascending: false })
    .limit(limit);
  return { data, error: error?.message ?? null };
}

async function badgeCountForB(session) {
  return prodFetch("/api/me/notifications/badge-count?fresh=1", session, { method: "GET" });
}

function logcatDump(serial) {
  return adb(serial, "logcat", "-d", "-s", ...TAGS.split(" "));
}

function deviceBatteryNote(serial) {
  const dumpsys = adb(serial, "shell", "dumpsys", "deviceidle");
  const whitelist = /whitelisted=.*com\.dibay\.app/i.test(dumpsys);
  const mode = adb(serial, "shell", "cmd", "notification", "allowed_listeners");
  return { dozeWhitelist: whitelist, notificationListeners: mode.slice(0, 200) };
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, "");
  log(`A=${SERIAL_A}(aaaa) B=${SERIAL_B}(qqqq) room=${DIRECT_ROOM}`);
  log(`prod=${PROD}`);

  const devices = adb("", "devices");
  if (!devices.includes(SERIAL_A) || !devices.includes(SERIAL_B)) {
    log("FAIL preflight: both devices not connected");
    process.exit(1);
  }

  const pre = await checkProdPreflight();
  log(`preflight badge-api status=${pre.badgeApiStatus} body=${pre.badgeApiBody}`);
  log(`preflight rpc=${pre.rpcOk ? "OK" : pre.rpcError}`);
  log(`preflight active_room_id=${pre.activeRoomColOk ? "OK" : pre.activeRoomColError}`);

  adb(SERIAL_A, "logcat", "-c");
  adb(SERIAL_B, "logcat", "-c");

  const sessionA = await signInSession("aaaa");
  const sessionB = await signInSession("qqqq");

  const results = [];

  // Scenario 1 — B in app, outside room
  log("--- scenario 1: in-app outside room ---");
  adb(SERIAL_B, "shell", "am", "start", "-n", ACT);
  await sleep(2000);
  adb(SERIAL_B, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `${PROD}/community-messenger`);
  await sleep(3000);
  const beforeEvents = await queryEvents(5);
  const msg1 = await sendMessage(sessionA, `P0-QA-1 ${new Date().toISOString()}`);
  await sleep(8000);
  const afterEvents = await queryEvents(10);
  const badge1 = await badgeCountForB(sessionB);
  const bLog1 = logcatDump(SERIAL_B);
  const s1Pass =
    msg1.status === 200 &&
    msg1.json?.ok === true &&
    (afterEvents.data?.length ?? 0) > (beforeEvents.data?.length ?? 0);
  results.push({
    id: 1,
    name: "in-app outside room",
    pass: s1Pass,
    msgStatus: msg1.status,
    eventsDelta: (afterEvents.data?.length ?? 0) - (beforeEvents.data?.length ?? 0),
    badgeStatus: badge1.status,
    fcm: bLog1.includes("[fcm]") || bLog1.includes("native_notification"),
  });
  log(`scenario1 PASS=${s1Pass} msg=${msg1.status} events+${results[0].eventsDelta} badgeApi=${badge1.status}`);

  // Scenario 2 — same room foreground (presence)
  log("--- scenario 2: same room foreground ---");
  adb(SERIAL_B, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `dibay://chat/${DIRECT_ROOM}`);
  await sleep(5000);
  const before2 = await queryEvents(3);
  const msg2 = await sendMessage(sessionA, `P0-QA-2 same-room ${Date.now()}`);
  await sleep(8000);
  const after2 = await queryEvents(5);
  const latest2 = after2.data?.[0];
  const s2Pass =
    latest2?.push_suppressed_reason === "same_room_foreground" ||
    latest2?.unread === false ||
    latest2?.read_at != null;
  results.push({
    id: 2,
    name: "same room foreground",
    pass: s2Pass,
    latest: latest2,
    note: pre.activeRoomColOk ? "active_room_id ok" : "active_room_id MISSING — suppress may fail",
  });
  log(`scenario2 PASS=${s2Pass} latest=${JSON.stringify(latest2 ?? null)}`);

  // Scenario 3 — background
  log("--- scenario 3: background ---");
  adb(SERIAL_B, "shell", "input", "keyevent", "3");
  await sleep(1500);
  const msg3 = await sendMessage(sessionA, `P0-QA-3 bg ${Date.now()}`);
  await sleep(10000);
  const bLog3 = logcatDump(SERIAL_B);
  const s3Pass = bLog3.includes("native_notification_posted") || bLog3.includes("[fcm] message_received");
  results.push({ id: 3, name: "background", pass: s3Pass, msgStatus: msg3.status, fcmLines: bLog3.split("\n").slice(-15) });
  log(`scenario3 PASS=${s3Pass}`);

  // Scenario 4 — force stop
  log("--- scenario 4: force stop ---");
  adb(SERIAL_B, "shell", "am", "force-stop", PKG);
  await sleep(2000);
  const msg4 = await sendMessage(sessionA, `P0-QA-4 killed ${Date.now()}`);
  await sleep(12000);
  adb(SERIAL_B, "logcat", "-c");
  await sleep(2000);
  const bLog4 = logcatDump(SERIAL_B);
  results.push({
    id: 4,
    name: "force stop",
    pass: bLog4.includes("[fcm]") || bLog4.includes("native_notification"),
    msgStatus: msg4.status,
    note: "log after force-stop — may need notification tap",
  });
  log(`scenario4 PASS=${results[3].pass}`);

  const summary = {
    at: new Date().toISOString(),
    preflight: pre,
    batteryB: deviceBatteryNote(SERIAL_B),
    results,
    eventsSql: afterEvents,
    badgeApi: badge1,
    logcatB_tail: logcatDump(SERIAL_B).split("\n").slice(-40).join("\n"),
  };
  fs.writeFileSync(path.join(ROOT, "docs/perf/notification-p0-adb-qa-report.json"), JSON.stringify(summary, null, 2));
  log(`report written docs/perf/notification-p0-adb-qa-report.json`);
  log(`PASS count ${results.filter((r) => r.pass).length}/${results.length} (partial run)`);
}

main().catch((e) => {
  log(`FATAL ${e.message}`);
  process.exit(1);
});
