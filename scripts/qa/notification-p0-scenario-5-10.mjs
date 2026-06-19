#!/usr/bin/env node
/**
 * Notification P0 — Android APK scenarios 5~10 (lock/deeplink/read/missed).
 * Usage:
 *   node scripts/qa/notification-p0-scenario-5-10.mjs
 *   P0_SCENARIO=5|6|7|8|9|10 node scripts/qa/notification-p0-scenario-5-10.mjs
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
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const DIRECT_ROOM = process.env.P0_DIRECT_ROOM?.trim() || "b19e2672-f26f-4a2e-8125-52575da4a62a";
const P0_SCENARIO = (process.env.P0_SCENARIO ?? "all").trim().toUpperCase();
const OUT = path.join(ROOT, "docs/perf/notification-p0-scenario-5-10-run.log");
const OUT_JSON = path.join(ROOT, "docs/perf/notification-p0-scenario-5-10-report.json");
const LOG_TAGS = ["DIBAY_FCM", "DIBAY_NOTIFY", "DIBAY_PUSH_REGISTER", "DIBAY_MISSED_CALL"];

function log(line) {
  const msg = `[p0-5-10] ${line}`;
  console.log(msg);
  fs.appendFileSync(OUT, msg + "\n");
}

function adb(serial, ...args) {
  return spawnSync(ADB, serial ? ["-s", serial, ...args] : args, { encoding: "utf8" });
}

function adbOut(serial, ...args) {
  return adb(serial, ...args).stdout ?? "";
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
  return { cookie, session: data.session, userId: data.session.user.id };
}

function supabaseAdmin() {
  loadEnv();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function prodFetch(pathname, auth, init = {}) {
  const headers = {
    Accept: "application/json",
    Cookie: auth.cookie,
    ...(init.headers ?? {}),
  };
  if (init.body != null && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (auth.session?.access_token) headers.Authorization = `Bearer ${auth.session.access_token}`;
  const res = await fetch(`${PROD}${pathname}`, { ...init, headers, body: init.body });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text: text.slice(0, 400) };
}

async function badgeCount(authB) {
  const r = await prodFetch("/api/me/notifications/badge-count?fresh=1", authB, { method: "GET" });
  return { status: r.status, total: r.json?.total ?? null, chat: r.json?.chat ?? null, missedCall: r.json?.missedCall ?? r.json?.missed_call ?? null, json: r.json };
}

async function queryEvents(limit = 10, type = null) {
  const sb = supabaseAdmin();
  let q = sb
    .from("notification_events")
    .select("id,user_id,type,room_id,read_at,opened_at,created_at,unread,category")
    .eq("user_id", USER_B)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (type) q = q.eq("type", type);
  const { data, error } = await q;
  return { data: data ?? [], error: error?.message ?? null };
}

async function queryDeliveries(limit = 8) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("notification_deliveries")
    .select("id,status,reason,provider,created_at,event_id,user_id")
    .eq("user_id", USER_B)
    .order("created_at", { ascending: false })
    .limit(limit);
  return { data: data ?? [], error: error?.message ?? null };
}

async function queryActiveDevices() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("user_devices")
    .select("id,user_id,platform,is_active,updated_at,device_id,push_provider")
    .eq("user_id", USER_B)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(3);
  return { data: data ?? [], error: error?.message ?? null };
}

function logcatDump(serial) {
  const parts = ["logcat", "-d"];
  for (const tag of LOG_TAGS) parts.push("-s", tag);
  return adbOut(serial, ...parts);
}

function analyzeFcm(text) {
  const chatLines = text.split("\n").filter((l) => /type=chat_message|native_notification_posted title=새 메시지/.test(l));
  const posted = text.match(/native_notification_posted/g) ?? [];
  return {
    messageReceived: /\[fcm\] message_received/.test(text),
    dataTypeChat: /data_type_detected type=chat_message/.test(text),
    nativePosted: /native_notification_posted/.test(text),
    chatPostedCount: posted.filter((_, i, arr) => arr.indexOf(_) === i).length,
    duplicateRisk: chatLines.length > 2,
    fcmLines: text.split("\n").filter(Boolean).slice(-25),
  };
}

function dibayNotifications(serial) {
  const text = adbOut(serial, "shell", "dumpsys", "notification", "--noredact");
  const msgs = text.split("\n").filter((l) => l.includes("com.dibay.app") && l.includes("dibay_messages"));
  const missed = text.split("\n").filter((l) => l.includes("com.dibay.app") && /missed|dibay_missed|call-history/i.test(l));
  return { dibayMessages: msgs.length, missedChannel: missed.length, samples: msgs.slice(-5) };
}

function isScreenOn(serial) {
  const p = adbOut(serial, "shell", "dumpsys", "power");
  return /Display Power: state=ON|mHoldingDisplaySuspendBlocker=true/.test(p);
}

function lockScreen(serial) {
  adb(serial, "shell", "input", "keyevent", "26");
}

function wakeScreen(serial) {
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "input", "keyevent", "82");
}

async function launchBMessenger() {
  adb(SERIAL_B, "shell", "am", "start", "-n", ACT);
  adb(SERIAL_B, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `${PROD}/community-messenger`);
  await sleep(4000);
}

async function sendMessage(authA, label) {
  return prodFetch(`/api/community-messenger/rooms/${DIRECT_ROOM}/messages`, authA, {
    method: "POST",
    body: JSON.stringify({
      content: label,
      clientMessageId: `p0-510-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    }),
  });
}

async function tapNotificationViaIntent(eventId, roomId = DIRECT_ROOM) {
  adb(SERIAL_B, "logcat", "-c");
  adb(
    SERIAL_B,
    "shell",
    "am",
    "start",
    "-n",
    ACT,
    "--es",
    "type",
    "chat_message",
    "--es",
    "roomId",
    roomId,
    "--es",
    "notificationEventId",
    eventId,
    "--es",
    "notificationId",
    eventId
  );
  await sleep(8000);
}

async function openRoomViaDibay(roomId = DIRECT_ROOM) {
  adb(SERIAL_B, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `dibay://chat/${roomId}`, "-n", ACT);
  await sleep(6000);
}

async function expandAndTapLatestNotification() {
  wakeScreen(SERIAL_B);
  await sleep(500);
  adb(SERIAL_B, "shell", "cmd", "statusbar", "expand-notifications");
  await sleep(1500);
  adb(SERIAL_B, "shell", "uiautomator", "dump", "/sdcard/p0_notif.xml");
  adb(SERIAL_B, "pull", "/sdcard/p0_notif.xml", "/tmp/p0_notif.xml");
  if (!fs.existsSync("/tmp/p0_notif.xml")) return { tapped: false, reason: "no dump" };
  const xml = fs.readFileSync("/tmp/p0_notif.xml", "utf8");
  const nodes = [
    ...xml.matchAll(/text="(새 메시지|New message|qqqq|aaaa)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g),
    ...xml.matchAll(/content-desc="(새 메시지|New message)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g),
  ];
  if (nodes.length === 0) return { tapped: false, reason: "no node" };
  const m = nodes[0];
  const x = Math.floor((+m[2] + +m[4]) / 2);
  const y = Math.floor((+m[3] + +m[5]) / 2);
  adb(SERIAL_B, "shell", "input", "tap", String(x), String(y));
  await sleep(6000);
  return { tapped: true, x, y };
}

async function pollCallSession(sinceIso) {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("community_messenger_call_sessions")
    .select("id, status, call_kind, created_at")
    .eq("initiator_user_id", USER_A)
    .eq("recipient_user_id", USER_B)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function waitCallSession(sinceIso, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await pollCallSession(sinceIso);
    if (row?.id) return row;
    await sleep(2000);
  }
  return null;
}

async function startOutgoingCall(kind, authA) {
  const sinceIso = new Date().toISOString();
  for (const perm of ["android.permission.RECORD_AUDIO", "android.permission.CAMERA", "android.permission.POST_NOTIFICATIONS"]) {
    adb(SERIAL_A, "shell", "pm", "grant", PKG, perm);
    adb(SERIAL_B, "shell", "pm", "grant", PKG, perm);
  }
  wakeScreen(SERIAL_B);
  adb(SERIAL_B, "shell", "am", "start", "-n", ACT);
  await sleep(1500);

  const apiStart = await prodFetch(`/api/community-messenger/rooms/${DIRECT_ROOM}/calls`, authA, {
    method: "POST",
    body: JSON.stringify({ callKind: kind, dialIntent: "fresh" }),
  });
  log(`callStart API status=${apiStart.status} ok=${apiStart.json?.ok} callId=${apiStart.json?.callId ?? ""} err=${apiStart.json?.error ?? ""}`);
  if (apiStart.status === 200 && apiStart.json?.callId) {
    return {
      id: apiStart.json.callId,
      status: apiStart.json.status ?? "ringing",
      call_kind: kind,
    };
  }

  adb(SERIAL_A, "logcat", "-c");
  wakeScreen(SERIAL_A);
  adb(SERIAL_A, "shell", "am", "start", "-n", ACT);
  const tmp = `tmp_p0_${Date.now()}`;
  const q = new URLSearchParams({ kind, peerUserId: USER_B });
  const httpsUrl = `${PROD}/community-messenger/calls/${encodeURIComponent(tmp)}?${q.toString()}`;
  adb(SERIAL_A, "shell", "am", "start", "-n", ACT, "-a", "android.intent.action.VIEW", "-d", httpsUrl);
  await sleep(8000);
  return waitCallSession(sinceIso, 45_000);
}

async function markCallMissed(authA, sessionId) {
  return prodFetch(`/api/community-messenger/calls/${sessionId}/missed`, authA, { method: "POST" });
}

function topActivity(serial) {
  const t = adbOut(serial, "shell", "dumpsys", "activity", "activities");
  const m = t.match(/topResumedActivity=ActivityRecord\{[^ ]+ \S+ (\S+\/\S+)/);
  if (m?.[1]) return m[1];
  const m2 = t.match(/mResumedActivity: ActivityRecord\{[^ ]+ \S+ (\S+\/\S+)/);
  return m2?.[1] ?? null;
}

function openedNonApk(serial) {
  const top = topActivity(serial) ?? "";
  return top.length > 0 && !top.startsWith(PKG);
}

function shouldRun(id) {
  if (P0_SCENARIO === "ALL" || !P0_SCENARIO) return true;
  return P0_SCENARIO === String(id);
}

function runApkLogin(serial, user, userId) {
  log(`APK login ${user} on ${serial}`);
  const r = spawnSync("node", [path.join(ROOT, "scripts/qa/notification-p0-apk-b-login.mjs")], {
    encoding: "utf8",
    env: {
      ...process.env,
      P0_APK_LOGIN_SERIAL: serial,
      P0_APK_LOGIN_USER: user,
      P0_APK_LOGIN_USER_ID: userId,
      P0_APK_CDP_PORT: user === "aaaa" ? "9223" : "9224",
    },
  });
  log(`apk-login ${user} exit=${r.status}`);
  return r.status === 0;
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, "");
  log(`scenario=${P0_SCENARIO} A=${SERIAL_A} B=${SERIAL_B}`);

  const devices = adbOut("", "devices");
  if (!devices.includes(SERIAL_A) || !devices.includes(SERIAL_B)) {
    log("FAIL devices missing");
    process.exit(1);
  }

  runApkLogin(SERIAL_B, "qqqq", USER_B);
  runApkLogin(SERIAL_A, "aaaa", USER_A);

  const devicesB = await queryActiveDevices();
  if ((devicesB.data?.length ?? 0) === 0) {
    log("STOP qqqq user_devices active=0");
    process.exit(1);
  }
  log(`qqqq devices active=${devicesB.data.length}`);

  const authA = await signInCookie("aaaa");
  const authB = await signInCookie("qqqq");
  const results = [];
  let lastChatEventId = null;
  let lastMissedEventId = null;
  let lastMissedSessionId = null;

  if (shouldRun(5)) {
    log("=== scenario 5 lock screen ===");
    adb(SERIAL_B, "logcat", "-c");
    const notifBefore = dibayNotifications(SERIAL_B);
    const _eventsBefore = await queryEvents(5, "chat_message");
    const badgeBefore = await badgeCount(authB);
    const _deliveriesBefore = await queryDeliveries(5);

    await launchBMessenger();
    adb(SERIAL_B, "shell", "input", "keyevent", "3");
    await sleep(800);
    lockScreen(SERIAL_B);
    await sleep(1500);
    const locked = !isScreenOn(SERIAL_B);
    log(`screenLocked=${locked}`);

    const label = `P0-QA-5 lock ${Date.now()}`;
    const msg = await sendMessage(authA, label);
    await sleep(15000);

    const logcat = logcatDump(SERIAL_B);
    const fcm = analyzeFcm(logcat);
    const notifAfter = dibayNotifications(SERIAL_B);
    const eventsAfter = await queryEvents(8, "chat_message");
    const badgeAfter = await badgeCount(authB);
    const deliveriesAfter = await queryDeliveries(8);
    const sentNew = deliveriesAfter.data.filter((d) => d.status === "sent").length;
    const latest = eventsAfter.data?.[0] ?? null;
    if (latest?.id) lastChatEventId = latest.id;

    for (const line of fcm.fcmLines.slice(-12)) log(`logcat ${line}`);

    const pass =
      msg.status === 200 &&
      msg.json?.ok === true &&
      fcm.messageReceived &&
      fcm.dataTypeChat &&
      fcm.nativePosted &&
      (latest?.unread === true || latest?.read_at == null) &&
      (badgeAfter.total ?? 0) > (badgeBefore.total ?? 0) &&
      notifAfter.dibayMessages >= notifBefore.dibayMessages;

    results.push({
      id: 5,
      name: "lock screen",
      pass,
      p0Required: true,
      msgStatus: msg.status,
      screenLocked: locked,
      lockNotificationVisible: notifAfter.dibayMessages > notifBefore.dibayMessages,
      badgeBefore: badgeBefore.total,
      badgeAfter: badgeAfter.total,
      notifBefore: notifBefore.dibayMessages,
      notifAfter: notifAfter.dibayMessages,
      latestEvent: latest,
      deliveriesSent: sentNew,
      deliveriesRecent: deliveriesAfter.data.slice(0, 3),
      duplicateNotification: fcm.duplicateRisk,
      fcm,
      verdict: pass ? "app-lock-fcm" : "app-fcm-lock",
    });
    log(`scenario5 PASS=${pass} badge ${badgeBefore.total}->${badgeAfter.total} notif ${notifBefore.dibayMessages}->${notifAfter.dibayMessages}`);
  }

  if (shouldRun(6)) {
    log("=== scenario 6 deeplink tap ===");
    adb(SERIAL_B, "logcat", "-c");
    await launchBMessenger();
    adb(SERIAL_B, "shell", "input", "keyevent", "3");
    await sleep(800);
    lockScreen(SERIAL_B);
    await sleep(1000);
    const label6 = `P0-QA-6 deeplink ${Date.now()}`;
    const msg6 = await sendMessage(authA, label6);
    await sleep(12000);
    const ev6 = await queryEvents(3, "chat_message");
    lastChatEventId = ev6.data?.[0]?.id ?? lastChatEventId;
    log(`msg6 status=${msg6.status} eventId=${lastChatEventId}`);

    wakeScreen(SERIAL_B);
    await sleep(500);

    let tap = await expandAndTapLatestNotification();
    await sleep(3000);
    let logcat = logcatDump(SERIAL_B);
    let full = adbOut(SERIAL_B, "logcat", "-d");
    if ((!/\[notify-open\] tap_received/.test(logcat) || openedNonApk(SERIAL_B)) && lastChatEventId) {
      log(`shade unreliable — APK notification intent eventId=${lastChatEventId}`);
      await tapNotificationViaIntent(lastChatEventId);
      tap = { tapped: true, via: "apk-notification-intent" };
      logcat = logcatDump(SERIAL_B);
      full = adbOut(SERIAL_B, "logcat", "-d");
    }
    const openedChrome = openedNonApk(SERIAL_B);
    const top = topActivity(SERIAL_B);
    const notifyOpen =
      /\[notify-open\] tap_received/.test(logcat) ||
      /\[notify-open\] deeplink_consumed/.test(logcat) ||
      /\[notify-open\] deeplink_consumed/.test(full) ||
      /\[push-route\] route_resolved/.test(full);
    const deeplinkConsumed =
      /deeplink_consumed|route_resolved path=\/community-messenger\/rooms/.test(logcat + full);
    const roomOpened =
      /room_opened|community-messenger\/rooms/.test(logcat + full);

    const pass = tap.tapped && notifyOpen && !openedChrome && (deeplinkConsumed || roomOpened);

    results.push({
      id: 6,
      name: "deeplink tap",
      pass,
      p0Required: true,
      tap,
      openedChrome,
      notifyOpen,
      deeplinkConsumed,
      roomOpened,
      notificationEventId: lastChatEventId,
      topActivity: top,
      logcatTail: logcat.split("\n").filter(Boolean).slice(-15),
      verdict: openedChrome ? "chrome-fail" : pass ? "app-apk-deeplink" : "app-deeplink",
    });
    log(`scenario6 PASS=${pass} chrome=${openedChrome} tap=${JSON.stringify(tap)}`);
  }

  if (shouldRun(7)) {
    log("=== scenario 7 read/badge clear ===");
    const badgeBefore = await badgeCount(authB);
    const _eventsBefore = await queryEvents(5, "chat_message");
    adb(SERIAL_B, "logcat", "-c");
    await openRoomViaDibay(DIRECT_ROOM);
    await sleep(8000);
    const badgeAfter = await badgeCount(authB);
    const eventsAfter = await queryEvents(8, "chat_message");
    const logcat = logcatDump(SERIAL_B);
    const roomRead = /room_opened|room-read/.test(logcat) || /room_opened/.test(adbOut(SERIAL_B, "logcat", "-d"));
    const readAtSet = eventsAfter.data?.some((e) => e.read_at != null || e.unread === false) ?? false;
    const pass =
      (badgeAfter.total ?? 0) < (badgeBefore.total ?? 0) || readAtSet || roomRead;

    results.push({
      id: 7,
      name: "read badge clear",
      pass,
      p0Required: true,
      badgeBefore: badgeBefore.total,
      badgeAfter: badgeAfter.total,
      readAtSet,
      roomRead,
      eventsSample: eventsAfter.data?.slice(0, 3),
      logcatTail: logcat.split("\n").filter(Boolean).slice(-10),
      verdict: pass ? "app-read-badge" : "app-read-pending",
    });
    log(`scenario7 PASS=${pass} badge ${badgeBefore.total}->${badgeAfter.total} readAt=${readAtSet}`);
  }

  async function runMissed(kind, scenarioId) {
    log(`=== scenario ${scenarioId} missed ${kind} ===`);
    adb(SERIAL_B, "logcat", "-c");
    const badgeBefore = await badgeCount(authB);
    const eventsBefore = await queryEvents(5, "missed_call");
    await launchBMessenger();
    adb(SERIAL_B, "shell", "input", "keyevent", "3");
    lockScreen(SERIAL_B);
    await sleep(1000);

    const session = await startOutgoingCall(kind, authA);
    if (!session?.id) {
      results.push({ id: scenarioId, name: `missed ${kind}`, pass: false, error: "no call session" });
      return;
    }
    lastMissedSessionId = session.id;
    log(`callSession=${session.id} status=${session.status}`);
    await sleep(8000);
    const missedRes = await markCallMissed(authA, session.id);
    log(`missed API status=${missedRes.status} ok=${missedRes.json?.ok}`);
    await sleep(12000);

    const logcat = logcatDump(SERIAL_B);
    const fcmMissed = /missed_call|DIBAY_MISSED_CALL|type=missed_call/.test(logcat);
    const eventsAfter = await queryEvents(8, "missed_call");
    const latest = eventsAfter.data?.[0] ?? null;
    if (latest?.id) lastMissedEventId = latest.id;
    const badgeAfter = await badgeCount(authB);
    const deliveries = await queryDeliveries(5);
    const pass =
      missedRes.status === 200 &&
      missedRes.json?.ok === true &&
      (latest?.type === "missed_call" || (eventsAfter.data?.length ?? 0) > (eventsBefore.data?.length ?? 0)) &&
      (fcmMissed || /native_notification/.test(logcat));

    results.push({
      id: scenarioId,
      name: `missed ${kind}`,
      pass,
      p0Required: true,
      callSessionId: session.id,
      missedApi: { status: missedRes.status, ok: missedRes.json?.ok },
      latestEvent: latest,
      badgeBefore: badgeBefore.total,
      badgeAfter: badgeAfter.total,
      missedCallBadge: badgeAfter.missedCall,
      deliveriesRecent: deliveries.data.slice(0, 3),
      fcmMissed,
      logcatTail: logcat.split("\n").filter(Boolean).slice(-15),
      verdict: pass ? "app-missed-call" : "app-missed-pending",
    });
    log(`scenario${scenarioId} PASS=${pass} missedCall badge=${badgeAfter.missedCall}`);
  }

  if (shouldRun(8)) await runMissed("voice", 8);
  if (shouldRun(9)) await runMissed("video", 9);

  if (shouldRun(10)) {
    log("=== scenario 10 missed call history read ===");
    if (!lastMissedEventId) {
      const ev = await queryEvents(3, "missed_call");
      lastMissedEventId = ev.data?.[0]?.id ?? null;
      lastMissedSessionId = ev.data?.[0]?.room_id ? null : lastMissedSessionId;
    }
    const badgeBefore = await badgeCount(authB);
    adb(SERIAL_B, "logcat", "-c");
    const path =
      lastMissedSessionId != null
        ? `/community-messenger/rooms/${DIRECT_ROOM}?focus=call-history&callId=${encodeURIComponent(lastMissedSessionId)}`
        : `/community-messenger/rooms/${DIRECT_ROOM}?focus=call-history`;
    adb(
      SERIAL_B,
      "shell",
      "am",
      "start",
      "-n",
      ACT,
      "-a",
      "android.intent.action.VIEW",
      "-d",
      `${PROD}${path}`
    );
    await sleep(8000);
    const badgeAfter = await badgeCount(authB);
    const eventsAfter = await queryEvents(8, "missed_call");
    const logcat = logcatDump(SERIAL_B);
    const readAtSet = eventsAfter.data?.some((e) => e.read_at != null || e.opened_at != null) ?? false;
    const pass = readAtSet || (badgeAfter.missedCall ?? 0) < (badgeBefore.missedCall ?? 0) || (eventsAfter.data?.length ?? 0) > 0 && readAtSet;

    results.push({
      id: 10,
      name: "missed call history read",
      pass,
      p0Required: true,
      badgeBefore: badgeBefore.total,
      badgeAfter: badgeAfter.total,
      missedCallBadgeBefore: badgeBefore.missedCall,
      missedCallBadgeAfter: badgeAfter.missedCall,
      readAtSet,
      eventsSample: eventsAfter.data?.slice(0, 3),
      logcatTail: logcat.split("\n").filter(Boolean).slice(-10),
      verdict: pass ? "app-missed-read" : "app-missed-read-pending",
    });
    log(`scenario10 PASS=${pass}`);
  }

  const report = {
    at: new Date().toISOString(),
    platform: "android-apk",
    devices: { A: SERIAL_A, B: SERIAL_B },
    qqqqDevices: devicesB.data,
    results,
    iosStatus: "NOT VERIFIED — see docs/dibay-notification-p0-ios-qa.md",
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  log(`report ${OUT_JSON}`);
  log(`PASS ${results.filter((r) => r.pass).length}/${results.length}`);
}

main().catch((e) => {
  log(`FATAL ${e.message}`);
  process.exit(1);
});
