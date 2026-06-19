#!/usr/bin/env node
/**
 * Notification P0 — 2-device adb QA (A=aaaa / B=qqqq).
 * Usage:
 *   node scripts/qa/notification-p0-adb-qa.mjs
 *   P0_PREFLIGHT_ONLY=1 node scripts/qa/notification-p0-adb-qa.mjs
 *   P0_SCENARIO=3|4A|4B node scripts/qa/notification-p0-adb-qa.mjs
 *   P0_APK_LOGIN=1 node scripts/qa/notification-p0-adb-qa.mjs  # B APK qqqq login helper
 *
 * Scenario 4 split:
 *   4A = normal killed (HOME + recents swipe + am kill) — P0 required
 *   4B = adb am force-stop — OS limitation check only (GCM CANCELLED)
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
const PROD = process.env.P0_PROD?.trim() || "https://samarket.vercel.app";
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const DIRECT_ROOM = process.env.P0_DIRECT_ROOM?.trim() || "b19e2672-f26f-4a2e-8125-52575da4a62a";
const PREFLIGHT_ONLY = process.env.P0_PREFLIGHT_ONLY === "1";
const P0_SCENARIO = process.env.P0_SCENARIO?.trim() || "";
const P0_APK_LOGIN = process.env.P0_APK_LOGIN !== "0";
const OUT = path.join(ROOT, "docs/perf/notification-p0-adb-qa-run.log");
const OUT_JSON = path.join(ROOT, "docs/perf/notification-p0-adb-qa-report.json");
const TAGS = "DIBAY_FCM DIBAY_PUSH_REGISTER DIBAY_NOTIFY DIBAY_MISSED_CALL ReactNativeJS";

function loadEnvLocal() {
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

function log(line) {
  const msg = `[notification-p0-qa] ${line}`;
  console.log(msg);
  fs.appendFileSync(OUT, msg + "\n");
}

function adb(serial, ...args) {
  return spawnSync(ADB, serial ? ["-s", serial, ...args] : args, { encoding: "utf8" }).stdout ?? "";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function supabaseAdmin() {
  loadEnvLocal();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/** 앱·다른 prod QA 와 동일 — sb auth cookie + samarket_active_session_id */
async function signInCookie(login) {
  loadEnvLocal();
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
  let activeSessionId = null;
  if (sk) {
    const admin = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", data.session.user.id)
      .maybeSingle();
    activeSessionId = String(pr?.active_session_id ?? "").trim() || null;
    if (activeSessionId) {
      cookie += `; samarket_active_session_id=${encodeURIComponent(activeSessionId)}`;
    }
  }
  return {
    cookie,
    userId: data.session.user.id,
    email,
    session: data.session,
    activeSessionId,
  };
}

async function prodFetch(pathname, auth, init = {}) {
  const headers = {
    Accept: "application/json",
    Cookie: auth.cookie,
    ...(init.headers ?? {}),
  };
  if (init.body != null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (auth.session?.access_token) {
    headers.Authorization = `Bearer ${auth.session.access_token}`;
  }
  const res = await fetch(`${PROD}${pathname}`, {
    ...init,
    headers,
    body: init.body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text: text.slice(0, 800) };
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

async function queryActiveUserDevices(userId) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("user_devices")
    .select("id,user_id,platform,push_provider,is_active,updated_at,device_id,push_token")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(5);
  return { data: data ?? [], error: error?.message ?? null };
}

async function queryDeliveries(limit = 5) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("notification_deliveries")
    .select("id,status,reason,provider,created_at,event_id,user_id")
    .eq("user_id", USER_B)
    .order("created_at", { ascending: false })
    .limit(limit);
  return { data: data ?? [], error: error?.message ?? null };
}

function dibayMessageNotifications(serial) {
  const text = adb(serial, "shell", "dumpsys", "notification", "--noredact");
  const hits = text.split("\n").filter(
    (l) => l.includes("com.dibay.app") && (l.includes("dibay_messages") || l.includes("StatusBarNotification"))
  );
  return { count: hits.length, samples: hits.slice(-8) };
}

function analyzeFcmLogcat(serial) {
  const filtered = logcatDump(serial);
  const full = adb(serial, "logcat", "-d");
  const gcm = full
    .split("\n")
    .filter((l) => /GCM|FirebaseMessaging|CANCELLED|c2dm/.test(l))
    .slice(-8)
    .join("\n");
  const t = `${filtered}\n${gcm}`;
  return {
    messageReceived: /\[fcm\] message_received/.test(t),
    dataTypeChat: /data_type_detected type=chat_message/.test(t),
    nativePosted: /native_notification_posted/.test(t),
    gcmCancelled: /result=CANCELLED/.test(t),
    fcmLines: filtered.split("\n").filter(Boolean).slice(-20),
    gcmLines: gcm.split("\n").filter(Boolean),
  };
}

async function killBNormal() {
  adb(SERIAL_B, "shell", "input", "keyevent", "3");
  await sleep(800);
  adb(SERIAL_B, "shell", "input", "keyevent", "187");
  await sleep(1200);
  const sz = adb(SERIAL_B, "shell", "wm", "size");
  const m = sz.match(/(\d+)x(\d+)/);
  const w = Number(m?.[1] ?? 1080);
  const h = Number(m?.[2] ?? 2400);
  adb(
    SERIAL_B,
    "shell",
    "input",
    "swipe",
    String(Math.floor(w / 2)),
    String(Math.floor(h * 0.75)),
    String(Math.floor(w / 2)),
    "0",
    "350"
  );
  await sleep(800);
  adb(SERIAL_B, "shell", "am", "kill", PKG);
  await sleep(1500);
}

async function forceStopB() {
  adb(SERIAL_B, "shell", "am", "force-stop", PKG);
  await sleep(2000);
}

function runApkBLoginHelper() {
  if (!P0_APK_LOGIN) {
    log("P0_APK_LOGIN=0 — skip APK WebView qqqq login helper");
    return { ok: true, skipped: true };
  }
  log("APK WebView qqqq login/register helper");
  const r = spawnSync("node", [path.join(ROOT, "scripts/qa/notification-p0-apk-b-login.mjs")], {
    encoding: "utf8",
    env: process.env,
  });
  log(`apk-login exit=${r.status}`);
  if (r.stdout) log(r.stdout.trim().split("\n").slice(-4).join(" | "));
  return { ok: r.status === 0, exit: r.status };
}

async function runFcmKillScenario(id, name, prepKill, authA, authB) {
  await requireQqqqActiveDevice();
  log(`--- scenario ${id}: ${name} ---`);
  const t0 = Date.now();
  adb(SERIAL_B, "logcat", "-c");
  const notifBefore = dibayMessageNotifications(SERIAL_B);
  adb(SERIAL_B, "shell", "am", "start", "-n", ACT);
  adb(SERIAL_B, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `${PROD}/community-messenger`);
  await sleep(5000);
  const badgeBefore = await badgeCountForB(authB);
  await prepKill();
  await sleep(2000);
  const msg = await sendMessage(authA, `P0-QA-${id} ${name} ${t0}`);
  await sleep(15000);
  const analysis = analyzeFcmLogcat(SERIAL_B);
  const notifAfter = dibayMessageNotifications(SERIAL_B);
  const badgeAfter = await badgeCountForB(authB);
  const deliveries = await queryDeliveries(5);
  const sentRows = deliveries.data.filter((d) => d.status === "sent");

  const passCore =
    msg.status === 200 &&
    msg.json?.ok === true &&
    analysis.messageReceived &&
    analysis.dataTypeChat &&
    analysis.nativePosted;

  let pass;
  let verdict;
  let p0Required = false;
  let osLimitationOnly = false;

  if (id === "4A") {
    p0Required = true;
    pass = passCore;
    verdict = pass ? "app-normal-killed" : analysis.gcmCancelled ? "os-policy" : "app-fcm";
  } else {
    p0Required = false;
    if (analysis.gcmCancelled && !passCore) {
      pass = false;
      osLimitationOnly = true;
      verdict = "android-force-stop-limitation";
    } else {
      pass = passCore;
      verdict = pass ? "app-force-stop-fcm" : "app-fcm";
    }
  }

  log(
    `scenario${id} PASS=${pass} p0Required=${p0Required} verdict=${verdict} gcmCancelled=${analysis.gcmCancelled} notifDelta=${notifAfter.count - notifBefore.count}`
  );

  return {
    id,
    name,
    pass,
    p0Required,
    osLimitationOnly,
    msgStatus: msg.status,
    badgeBefore: badgeBefore.json?.total ?? 0,
    badgeAfter: badgeAfter.json?.total ?? 0,
    notifBefore: notifBefore.count,
    notifAfter: notifAfter.count,
    notifDelta: notifAfter.count - notifBefore.count,
    deliveriesRecent: deliveries.data.slice(0, 3),
    deliveriesSent: sentRows.length,
    analysis,
    verdict,
  };
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

async function sendMessage(auth, preview) {
  return prodFetch(`/api/community-messenger/rooms/${DIRECT_ROOM}/messages`, auth, {
    method: "POST",
    body: JSON.stringify({
      content: preview,
      clientMessageId: `p0-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }),
  });
}

async function badgeCountForB(auth) {
  return prodFetch("/api/me/notifications/badge-count?fresh=1", auth, { method: "GET" });
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

function launchAppsForRelogin() {
  log("device prep: launch app + messenger home (A/B re-login if session stale)");
  for (const serial of [SERIAL_A, SERIAL_B]) {
    adb(serial, "shell", "am", "start", "-n", ACT);
    adb(serial, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `${PROD}/community-messenger`);
  }
}

async function runAuthPreflight(authA, authB) {
  const sessionA = await prodFetch("/api/auth/session", authA, { method: "GET" });
  const sessionB = await prodFetch("/api/auth/session", authB, { method: "GET" });
  const profileA = await prodFetch("/api/me/profile", authA, { method: "GET" });
  const profileB = await prodFetch("/api/me/profile", authB, { method: "GET" });
  const room = await prodFetch(
    `/api/community-messenger/rooms/${DIRECT_ROOM}/bootstrap?mode=instant&hydration=critical&messages=1`,
    authA,
    { method: "GET" }
  );
  const badgeBefore = await badgeCountForB(authB);
  const eventsBefore = await queryEvents(5);
  const msgProbe = await sendMessage(authA, `P0-AUTH-PREFLIGHT ${Date.now()}`);
  await sleep(4000);
  const eventsAfter = await queryEvents(10);
  const badgeAfter = await badgeCountForB(authB);
  const devicesA = await queryActiveUserDevices(USER_A);
  const devicesB = await queryActiveUserDevices(USER_B);

  const senderOk = authA.userId === USER_A;
  const sessionOk = sessionA.status === 200 && sessionA.json?.authenticated === true;
  const roomOk = room.status === 200 && (room.json?.ok === true || room.json?.room != null);
  const msgOk = msgProbe.status === 200 && msgProbe.json?.ok === true;
  const eventsDelta = (eventsAfter.data?.length ?? 0) - (eventsBefore.data?.length ?? 0);
  const badgeBeforeTotal = badgeBefore.json?.total ?? badgeBefore.json?.chat ?? 0;
  const badgeAfterTotal = badgeAfter.json?.total ?? badgeAfter.json?.chat ?? 0;

  const preflight = {
    sessionA: { status: sessionA.status, authenticated: sessionA.json?.authenticated ?? null },
    sessionB: { status: sessionB.status, authenticated: sessionB.json?.authenticated ?? null },
    profileA: { status: profileA.status, userId: authA.userId, activeSessionId: authA.activeSessionId },
    profileB: { status: profileB.status, userId: authB.userId, activeSessionId: authB.activeSessionId },
    senderUserIdOk: senderOk,
    room: { status: room.status, roomId: DIRECT_ROOM, ok: roomOk },
    messagePost: {
      status: msgProbe.status,
      ok: msgProbe.json?.ok ?? null,
      error: msgProbe.json?.error ?? null,
      body: msgProbe.text.slice(0, 200),
    },
    eventsBeforeCount: eventsBefore.data?.length ?? 0,
    eventsAfterCount: eventsAfter.data?.length ?? 0,
    eventsDelta,
    badgeBefore: { status: badgeBefore.status, total: badgeBeforeTotal, json: badgeBefore.json },
    badgeAfter: { status: badgeAfter.status, total: badgeAfterTotal, json: badgeAfter.json },
    userDevicesA: devicesA,
    userDevicesB: devicesB,
    pass: sessionOk && senderOk && roomOk && msgOk,
  };

  log(`auth-preflight sessionA=${sessionA.status} auth=${sessionA.json?.authenticated}`);
  log(`auth-preflight sender=${authA.userId} expected=${USER_A} ok=${senderOk}`);
  log(`auth-preflight room=${room.status} roomId=${DIRECT_ROOM} ok=${roomOk}`);
  log(`auth-preflight messagePost=${msgProbe.status} ok=${msgProbe.json?.ok} err=${msgProbe.json?.error ?? ""}`);
  log(`auth-preflight events delta=${eventsDelta} badge ${badgeBeforeTotal}->${badgeAfterTotal}`);
  log(`auth-preflight user_devices B active=${devicesB.data?.length ?? 0}`);
  log(`auth-preflight PASS=${preflight.pass}`);

  return preflight;
}

function shouldRunScenario(id) {
  if (!P0_SCENARIO) return true;
  const s = P0_SCENARIO.toUpperCase();
  const key = String(id).toUpperCase();
  if (s === key) return true;
  if (s === "4" && (key === "4A" || key === "4B")) return true;
  const n = Number(P0_SCENARIO);
  return Number.isFinite(n) && n === id;
}

function needsFcmDeviceSetup() {
  return shouldRunScenario(3) || shouldRunScenario("4A") || shouldRunScenario("4B");
}

async function requireQqqqActiveDevice() {
  const devicesB = await queryActiveUserDevices(USER_B);
  log(`qqqq active user_devices=${devicesB.data?.length ?? 0}`);
  if ((devicesB.data?.length ?? 0) === 0) {
    log("STOP: qqqq user_devices active row = 0 — run APK login + FCM register first");
    process.exit(1);
  }
  return devicesB;
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, "");
  log(`A=${SERIAL_A}(aaaa) B=${SERIAL_B}(qqqq) room=${DIRECT_ROOM}`);
  log(`prod=${PROD} preflightOnly=${PREFLIGHT_ONLY} scenario=${P0_SCENARIO || "all"}`);

  const devices = adb("", "devices");
  if (!devices.includes(SERIAL_A) || !devices.includes(SERIAL_B)) {
    log("FAIL preflight: both devices not connected");
    process.exit(1);
  }

  const pre = await checkProdPreflight();
  log(`preflight badge-api status=${pre.badgeApiStatus} body=${pre.badgeApiBody}`);
  log(`preflight rpc=${pre.rpcOk ? "OK" : pre.rpcError}`);
  log(`preflight active_room_id=${pre.activeRoomColOk ? "OK" : pre.activeRoomColError}`);

  launchAppsForRelogin();
  await sleep(5000);

  const authA = await signInCookie("aaaa");
  const authB = await signInCookie("qqqq");
  const authPreflight = await runAuthPreflight(authA, authB);

  if (!authPreflight.pass) {
    fs.writeFileSync(
      OUT_JSON,
      JSON.stringify({ at: new Date().toISOString(), preflight: pre, authPreflight, results: [] }, null, 2)
    );
    log("STOP auth preflight failed — fix cookie/active_session_id or app re-login");
    process.exit(1);
  }

  if (PREFLIGHT_ONLY) {
    fs.writeFileSync(
      OUT_JSON,
      JSON.stringify({ at: new Date().toISOString(), preflight: pre, authPreflight, preflightOnly: true }, null, 2)
    );
    log("P0_PREFLIGHT_ONLY=1 — auth preflight PASS, exiting before scenarios");
    process.exit(0);
  }

  adb(SERIAL_A, "logcat", "-c");
  adb(SERIAL_B, "logcat", "-c");

  const results = [];
  let afterEvents = { data: [] };
  let badge1 = { status: 0, json: {} };

  if (needsFcmDeviceSetup()) {
    runApkBLoginHelper();
    await requireQqqqActiveDevice();
  }

  // Scenario 1 — B in app, outside room
  if (shouldRunScenario(1)) {
  log("--- scenario 1: in-app outside room ---");
  adb(SERIAL_B, "shell", "am", "start", "-n", ACT);
  await sleep(2000);
  adb(SERIAL_B, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `${PROD}/community-messenger`);
  await sleep(3000);
  const beforeEvents = await queryEvents(5);
  const badge1Before = await badgeCountForB(authB);
  const msg1 = await sendMessage(authA, `P0-QA-1 ${new Date().toISOString()}`);
  await sleep(8000);
  const afterEvents = await queryEvents(10);
  badge1 = await badgeCountForB(authB);
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
    badgeBefore: badge1Before.json?.total ?? 0,
    badgeAfter: badge1.json?.total ?? 0,
    badgeStatus: badge1.status,
    fcm: bLog1.includes("[fcm]") || bLog1.includes("native_notification"),
    verdict: s1Pass ? "app" : msg1.status !== 200 ? "qa-auth-or-route" : "app-pipeline",
  });
  log(`scenario1 PASS=${s1Pass} msg=${msg1.status} events+${results[0].eventsDelta} badgeApi=${badge1.status}`);

  // Scenario 2 — same room foreground (presence)
  }

  if (shouldRunScenario(2)) {
  log("--- scenario 2: same room foreground ---");
  adb(SERIAL_B, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `dibay://chat/${DIRECT_ROOM}`);
  await sleep(5000);
  const _before2 = await queryEvents(3);
  const msg2 = await sendMessage(authA, `P0-QA-2 same-room ${Date.now()}`);
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
    msgStatus: msg2.status,
    note: pre.activeRoomColOk ? "active_room_id ok" : "active_room_id MISSING — suppress may fail",
    verdict: msg2.status !== 200 ? "qa-auth-or-route" : s2Pass ? "app" : "app-pipeline",
  });
  log(`scenario2 PASS=${s2Pass} latest=${JSON.stringify(latest2 ?? null)}`);

  // Scenario 3 — background
  }

  if (shouldRunScenario(3)) {
  await requireQqqqActiveDevice();
  log("--- scenario 3: background ---");
  adb(SERIAL_B, "logcat", "-c");
  const notif3Before = dibayMessageNotifications(SERIAL_B);
  const badge3Before = await badgeCountForB(authB);
  adb(SERIAL_B, "shell", "input", "keyevent", "3");
  await sleep(1500);
  const msg3 = await sendMessage(authA, `P0-QA-3 bg ${Date.now()}`);
  await sleep(10000);
  const analysis3 = analyzeFcmLogcat(SERIAL_B);
  const badge3After = await badgeCountForB(authB);
  const deliveries3 = await queryDeliveries(3);
  const s3Pass =
    msg3.status === 200 &&
    msg3.json?.ok === true &&
    analysis3.messageReceived &&
    analysis3.nativePosted;
  results.push({
    id: 3,
    name: "background",
    pass: s3Pass,
    p0Required: true,
    msgStatus: msg3.status,
    badgeBefore: badge3Before.json?.total ?? 0,
    badgeAfter: badge3After.json?.total ?? 0,
    notifBefore: notif3Before.count,
    notifAfter: dibayMessageNotifications(SERIAL_B).count,
    deliveriesRecent: deliveries3.data.slice(0, 3),
    fcmLines: analysis3.fcmLines,
    verdict: msg3.status !== 200 ? "qa-auth-or-route" : s3Pass ? "app" : "app-fcm",
  });
  log(`scenario3 PASS=${s3Pass}`);

  // Scenario 4A / 4B — killed vs force-stop
  }

  if (shouldRunScenario("4A")) {
  results.push(await runFcmKillScenario("4A", "normal-killed-recents", killBNormal, authA, authB));
  }

  if (shouldRunScenario("4B")) {
  results.push(await runFcmKillScenario("4B", "adb-force-stop", forceStopB, authA, authB));
  }

  if (!P0_SCENARIO) {
  for (const id of [5, 6, 7, 8, 9, 10]) {
    results.push({
      id,
      name: `scenario-${id}`,
      pass: false,
      note: "NOT RUN — automated script covers 1-4; manual/device scenarios 5-10 pending",
      verdict: "qa-script-gap",
    });
  }
  }

  const summary = {
    at: new Date().toISOString(),
    preflight: pre,
    authPreflight,
    batteryB: deviceBatteryNote(SERIAL_B),
    results,
    eventsSql: afterEvents,
    badgeApi: badge1,
    logcatB_tail: logcatDump(SERIAL_B).split("\n").slice(-40).join("\n"),
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
  log(`report written docs/perf/notification-p0-adb-qa-report.json`);
  log(`PASS count ${results.filter((r) => r.pass).length}/${results.length}`);
  log(`P0-required PASS ${results.filter((r) => r.p0Required && r.pass).length}/${results.filter((r) => r.p0Required).length}`);
}

main().catch((e) => {
  log(`FATAL ${e.message}`);
  process.exit(1);
});
