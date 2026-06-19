#!/usr/bin/env node
/**
 * Notification P0 — scenario 4A (normal kill) / 4B (force-stop) manual re-run.
 * Usage: node scripts/qa/notification-p0-scenario-4ab.mjs [4A|4B|both]
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
const PROD = (process.env.P0_PROD ?? "https://samarket.vercel.app").replace(/\/$/, "");
const DIRECT_ROOM = process.env.P0_DIRECT_ROOM?.trim() || "b19e2672-f26f-4a2e-8125-52575da4a62a";
const USER_B = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const MODE = (process.argv[2] ?? "both").toUpperCase();
const OUT = path.join(ROOT, "docs/perf/notification-p0-scenario-4ab-run.log");
const OUT_JSON = path.join(ROOT, "docs/perf/notification-p0-scenario-4ab-report.json");
const LOG_TAGS = ["DIBAY_FCM", "DIBAY_NOTIFY", "DIBAY_PUSH_REGISTER"];

function log(line) {
  const msg = `[p0-4ab] ${line}`;
  console.log(msg);
  fs.appendFileSync(OUT, msg + "\n");
}

function adb(serial, ...args) {
  return spawnSync(ADB, serial ? ["-s", serial, ...args] : args, { encoding: "utf8" });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
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

async function signInCookie(login) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const email = login.includes("@") ? login : `${login}@manual.local`;
  const password = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message ?? "no session"}`);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  let cookie = `${`sb-${ref}-auth-token`}=${encodeURIComponent(JSON.stringify(session))}`;
  if (sk) {
    const admin = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", data.session.user.id)
      .maybeSingle();
    if (pr?.active_session_id) {
      cookie += `; samarket_active_session_id=${encodeURIComponent(pr.active_session_id)}`;
    }
  }
  return { cookie, session: data.session };
}

async function sendMessage(auth, label) {
  const res = await fetch(`${PROD}/api/community-messenger/rooms/${DIRECT_ROOM}/messages`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: auth.cookie,
      Authorization: `Bearer ${auth.session.access_token}`,
    },
    body: JSON.stringify({
      content: label,
      clientMessageId: `p0-4-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text: text.slice(0, 200) };
}

async function badgeCount(authB) {
  const res = await fetch(`${PROD}/api/me/notifications/badge-count?fresh=1`, {
    headers: { Cookie: authB.cookie, Authorization: `Bearer ${authB.session.access_token}` },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, total: json?.total ?? null, json };
}

function logcatDump(serial) {
  const parts = ["logcat", "-d"];
  for (const tag of LOG_TAGS) parts.push("-s", tag);
  const r = adb(serial, ...parts);
  const filtered = r.stdout ?? "";
  const full = adb(serial, "logcat", "-d").stdout ?? "";
  const gcm = full
    .split("\n")
    .filter((l) => /GCM|FirebaseMessaging|CANCELLED|c2dm/.test(l))
    .slice(-8)
    .join("\n");
  return { filtered, gcm, fullTail: full.split("\n").slice(-30).join("\n") };
}

function dibayMessageNotifications() {
  const r = adb(SERIAL_B, "shell", "dumpsys", "notification", "--noredact");
  const text = r.stdout ?? "";
  const lines = text.split("\n");
  const hits = lines.filter(
    (l) =>
      l.includes("com.dibay.app") &&
      (l.includes("dibay_messages") || l.includes("StatusBarNotification"))
  );
  return { count: hits.length, samples: hits.slice(-12) };
}

async function queryDeliveries(limit = 5) {
  loadEnv();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb
    .from("notification_deliveries")
    .select("id,status,reason,provider,created_at,event_id,user_id")
    .eq("user_id", USER_B)
    .order("created_at", { ascending: false })
    .limit(limit);
  return { data: data ?? [], error: error?.message ?? null };
}

function wakeAndLaunchB() {
  adb(SERIAL_B, "shell", "input", "keyevent", "224");
  adb(SERIAL_B, "shell", "input", "keyevent", "82");
  adb(SERIAL_B, "shell", "am", "start", "-n", ACT);
  adb(SERIAL_B, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `${PROD}/community-messenger`);
}

/** Normal cold/killed — NOT force-stop. */
async function killBNormal() {
  adb(SERIAL_B, "shell", "input", "keyevent", "3");
  await sleep(800);
  adb(SERIAL_B, "shell", "input", "keyevent", "187");
  await sleep(1200);
  const sz = adb(SERIAL_B, "shell", "wm", "size").stdout ?? "";
  const m = sz.match(/(\d+)x(\d+)/);
  const w = Number(m?.[1] ?? 1080);
  const h = Number(m?.[2] ?? 2400);
  adb(SERIAL_B, "shell", "input", "swipe", String(Math.floor(w / 2)), String(Math.floor(h * 0.75)), String(Math.floor(w / 2)), "0", "350");
  await sleep(800);
  adb(SERIAL_B, "shell", "am", "kill", PKG);
  await sleep(1500);
}

async function forceStopB() {
  adb(SERIAL_B, "shell", "am", "force-stop", PKG);
  await sleep(2000);
}

function analyzeLogcat(logcat) {
  const t = `${logcat.filtered}\n${logcat.gcm}`;
  return {
    messageReceived: /\[fcm\] message_received/.test(t),
    dataTypeChat: /data_type_detected type=chat_message/.test(t),
    nativePosted: /native_notification_posted/.test(t),
    gcmCancelled: /result=CANCELLED/.test(t),
    fcmLines: logcat.filtered.split("\n").filter(Boolean).slice(-20),
    gcmLines: logcat.gcm.split("\n").filter(Boolean),
  };
}

async function runScenario(id, name, prepKill, authA, authB) {
  log(`=== scenario ${id}: ${name} ===`);
  const t0 = Date.now();
  adb(SERIAL_B, "logcat", "-c");
  const notifBefore = dibayMessageNotifications();
  log(`notifBefore count=${notifBefore.count} t0=${t0}`);

  wakeAndLaunchB();
  await sleep(5000);
  const badgeBefore = await badgeCount(authB);
  log(`badgeBefore total=${badgeBefore.total}`);

  await prepKill();
  await sleep(2000);

  const label = `P0-QA-${id} ${name} ${t0}`;
  const msg = await sendMessage(authA, label);
  log(`messagePost status=${msg.status} ok=${msg.json?.ok ?? null}`);
  await sleep(15000);

  const logcat = logcatDump(SERIAL_B);
  const analysis = analyzeLogcat(logcat);
  const notifAfter = dibayMessageNotifications();
  const badgeAfter = await badgeCount(authB);
  const deliveries = await queryDeliveries(3);

  for (const line of analysis.fcmLines) log(`logcat ${line}`);
  for (const line of analysis.gcmLines) log(`gcm ${line}`);
  log(`notifAfter count=${notifAfter.count} delta=${notifAfter.count - notifBefore.count}`);
  log(`badgeAfter total=${badgeAfter.total} delta=${(badgeAfter.total ?? 0) - (badgeBefore.total ?? 0)}`);
  log(`deliveries ${JSON.stringify(deliveries.data.slice(0, 3))}`);

  const passCore =
    msg.status === 200 &&
    msg.json?.ok === true &&
    analysis.messageReceived &&
    analysis.dataTypeChat &&
    analysis.nativePosted;

  let verdict;
  let pass;
  if (id === "4A") {
    pass = passCore;
    verdict = pass ? "app-normal-killed" : analysis.gcmCancelled ? "os-policy" : "app-fcm";
  } else {
    if (analysis.gcmCancelled && !passCore) {
      pass = false;
      verdict = "android-force-stop-limitation";
    } else {
      pass = passCore;
      verdict = pass ? "app-force-stop-fcm" : "app-fcm";
    }
  }

  log(`scenario${id} PASS=${pass} verdict=${verdict} gcmCancelled=${analysis.gcmCancelled}`);
  return {
    id,
    name,
    pass,
    p0Required: id === "4A",
    osLimitationOnly: id === "4B" && analysis.gcmCancelled && !passCore,
    msgStatus: msg.status,
    badgeBefore: badgeBefore.total,
    badgeAfter: badgeAfter.total,
    notifBefore: notifBefore.count,
    notifAfter: notifAfter.count,
    analysis,
    deliveries: deliveries.data,
    verdict,
  };
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, "");
  log(`mode=${MODE} B=${SERIAL_B} A=${SERIAL_A}`);

  const devices = adb("", "devices").stdout ?? "";
  if (!devices.includes(SERIAL_A) || !devices.includes(SERIAL_B)) {
    log("FAIL devices not connected");
    process.exit(1);
  }

  log("step: APK qqqq login/register helper");
  const loginRun = spawnSync("node", [path.join(ROOT, "scripts/qa/notification-p0-apk-b-login.mjs")], {
    encoding: "utf8",
    env: process.env,
  });
  log(`apk-login exit=${loginRun.status}`);
  if (loginRun.stdout) log(loginRun.stdout.trim().split("\n").slice(-5).join("\n"));

  const authA = await signInCookie("aaaa");
  const authB = await signInCookie("qqqq");
  const results = [];

  if (MODE === "BOTH" || MODE === "4A") {
    results.push(
      await runScenario("4A", "normal-killed-recents", () => killBNormal(), authA, authB)
    );
    await sleep(4000);
  }

  if (MODE === "BOTH" || MODE === "4B") {
    results.push(await runScenario("4B", "adb-force-stop", () => forceStopB(), authA, authB));
  }

  const report = { at: new Date().toISOString(), mode: MODE, results };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  log(`report ${OUT_JSON}`);
  log(`4A=${results.find((r) => r.id === "4A")?.pass ?? "skip"} 4B=${results.find((r) => r.id === "4B")?.pass ?? "skip"}`);
}

main().catch((e) => {
  log(`FATAL ${e.message}`);
  process.exit(1);
});
