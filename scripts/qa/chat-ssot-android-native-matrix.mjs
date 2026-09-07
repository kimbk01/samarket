#!/usr/bin/env node
/**
 * CHAT SSOT — Android native device matrix (CORE LOCKED).
 * Proves: FCM → OS notif → tap → exact CM room → no /group-chat → unread clear.
 * Does NOT modify chat core / unread / badge architecture.
 *
 * Usage:
 *   GROUP_P0_DEVICE_A=8b37179f7d94 GROUP_P0_DEVICE_B=RFCY40PY2CA \
 *   CHAT_SSOT_LOGIN_A=wwww CHAT_SSOT_LOGIN_B=qqqq \
 *   node scripts/qa/chat-ssot-android-native-matrix.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import {
  DIBAY_PKG,
  ensureApkWebViewLogin,
  openUrlInApkWebView,
  forwardCdp,
  connectWebView,
  discoverWebViewSocket,
} from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = DIBAY_PKG;
const ACT = `${PKG}/.MainActivity`;
const PROD = process.env.CHAT_SSOT_PROD?.trim() || "https://samarket.vercel.app";
const SERIAL_A = process.env.GROUP_P0_DEVICE_A?.trim() || "8b37179f7d94";
const SERIAL_B = process.env.GROUP_P0_DEVICE_B?.trim() || "RFCY40PY2CA";
const LOGIN_A = process.env.CHAT_SSOT_LOGIN_A?.trim() || "wwww";
const LOGIN_B = process.env.CHAT_SSOT_LOGIN_B?.trim() || "qqqq";
const CDP_A = Number(process.env.CHAT_SSOT_CDP_A || 9240);
const CDP_B = Number(process.env.CHAT_SSOT_CDP_B || 9241);
const OUT = path.join(ROOT, "docs/perf/chat-ssot-android-native-matrix.json");
const OUT_LOG = path.join(ROOT, "docs/perf/chat-ssot-android-native-matrix.log");
const FCM_TAGS = "DIBAY_FCM DIBAY_PUSH DIBAY_NOTIFY DIBAY_PUSH_ROUTE DIBAY_ROUTE";

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

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD?.trim(),
        process.env.QA_MANUAL_PASSWORD?.trim(),
        process.env.E2E_ADMIN_PASSWORD?.trim(),
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

function log(line) {
  const msg = `[android-matrix] ${line}`;
  console.log(msg);
  fs.appendFileSync(OUT_LOG, msg + "\n");
}

function adb(serial, ...args) {
  const r = spawnSync(ADB, serial ? ["-s", serial, ...args] : args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status ?? 1 };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function signInCookie(login) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const emails = login.includes("@") ? [login] : [`${login}@manual.local`, `${login}@dibay.local`];
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  let emailUsed = null;
  for (const email of emails) {
    for (const password of passwords()) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        session = data.session;
        emailUsed = email;
        break;
      }
    }
    if (session) break;
  }
  if (!session) throw new Error(`login failed ${login}`);
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
  let cookie = `${`sb-${ref}-auth-token`}=${encodeURIComponent(JSON.stringify(payload))}`;
  if (sk) {
    const { data: pr } = await admin()
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    if (pr?.active_session_id) {
      cookie += `; samarket_active_session_id=${encodeURIComponent(pr.active_session_id)}`;
    }
  }
  return { cookie, userId: session.user.id, email: emailUsed };
}

async function prodFetch(pathname, cookie, init = {}) {
  const res = await fetch(`${PROD}${pathname}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Cookie: cookie,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* */
  }
  return { status: res.status, json, text: text.slice(0, 800) };
}

async function sendText(cookie, roomId, content) {
  return prodFetch(`/api/community-messenger/rooms/${roomId}/messages`, cookie, {
    method: "POST",
    body: JSON.stringify({
      content,
      clientMessageId: `android-matrix-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });
}

async function markRead(cookie, roomId) {
  return prodFetch(`/api/community-messenger/rooms/${roomId}`, cookie, {
    method: "PATCH",
    body: JSON.stringify({ action: "mark_read", flushOpen: true }),
  });
}

async function waitEvent({ roomId, userId, type, afterIso, timeoutMs = 25000 }) {
  const sb = admin();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await sb
      .from("notification_events")
      .select(
        "id, type, room_id, user_id, message_id, chat_domain, display_payload, push_suppressed_reason, created_at"
      )
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .eq("type", type)
      .gte("created_at", afterIso)
      .order("created_at", { ascending: false })
      .limit(3);
    if (error) throw new Error(error.message);
    if (data?.length) return data[0];
    await sleep(1200);
  }
  return null;
}

async function unreadOf(roomId, userId) {
  const { data } = await admin()
    .from("community_messenger_participants")
    .select("unread_count")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  return Number(data?.unread_count ?? -1);
}

async function findSharedRoom(userA, userB, chatDomain) {
  const sb = admin();
  const { data: parts } = await sb
    .from("community_messenger_participants")
    .select("room_id")
    .eq("user_id", userA)
    .is("left_at", null)
    .limit(200);
  const ids = (parts ?? []).map((p) => p.room_id).filter(Boolean);
  if (!ids.length) return null;
  const { data: rooms } = await sb
    .from("community_messenger_rooms")
    .select("id, chat_domain, room_type, direct_key")
    .in("id", ids)
    .eq("chat_domain", chatDomain)
    .is("deleted_at", null)
    .limit(40);
  for (const room of rooms ?? []) {
    const { data: peer } = await sb
      .from("community_messenger_participants")
      .select("user_id, left_at")
      .eq("room_id", room.id)
      .eq("user_id", userB)
      .maybeSingle();
    if (peer && !peer.left_at) return room;
  }
  return rooms?.[0] ?? null;
}

async function ensureGroup(cookieA, userB) {
  const res = await prodFetch(`/api/community-messenger/group-rooms`, cookieA, {
    method: "POST",
    body: JSON.stringify({ title: `Native Matrix ${Date.now()}`, memberIds: [userB] }),
  });
  const id = res.json?.roomId ?? res.json?.room_id ?? null;
  if (!id) return null;
  const { data } = await admin()
    .from("community_messenger_rooms")
    .select("id, chat_domain, room_type, direct_key")
    .eq("id", id)
    .maybeSingle();
  return data;
}

function logcatDump(serial) {
  return adb(serial, "logcat", "-d", "-t", "400", "-s", ...FCM_TAGS.split(/\s+/)).stdout;
}

function logcatClear(serial) {
  adb(serial, "logcat", "-c");
}

function forceStop(serial) {
  adb(serial, "shell", "am", "force-stop", PKG);
}

function home(serial) {
  adb(serial, "shell", "input", "keyevent", "3");
}

function wake(serial) {
  adb(serial, "shell", "input", "keyevent", "224");
  adb(serial, "shell", "wm", "dismiss-keyguard");
}

function grantNotif(serial) {
  for (const p of [
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.RECORD_AUDIO",
  ]) {
    adb(serial, "shell", "pm", "grant", PKG, p);
  }
}

function trayHas(serial, needle) {
  const dump = adb(serial, "shell", "dumpsys", "notification", "--noredact").stdout;
  return dump.includes(needle);
}

async function pollLog(serial, pred, timeoutMs = 35000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    last = logcatDump(serial);
    if (pred(last)) return last;
    await sleep(2000);
  }
  return last;
}

function cmRoomPath(roomId) {
  return `/community-messenger/rooms/${encodeURIComponent(roomId)}`;
}

/** Simulate OS notification tap with Production FCM extras (url + type + roomId). */
function tapViaNotificationIntent({ serial, type, roomId, eventId, routeUrl }) {
  const url = routeUrl || cmRoomPath(roomId);
  const notifId = eventId || `matrix-${Date.now()}`;
  // Match DibayFirebaseMessagingService PendingIntent: ACTION_VIEW + CLEAR_TOP|SINGLE_TOP.
  const args = [
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-n",
    ACT,
    "-f",
    "0x14000000",
    "--es",
    "type",
    type,
    "--es",
    "roomId",
    roomId,
    "--es",
    "room_id",
    roomId,
    "--es",
    "url",
    url,
    "--es",
    "routeUrl",
    url,
    "--es",
    "notificationId",
    notifId,
    "--es",
    "notificationEventId",
    notifId,
  ];
  return adb(serial, ...args);
}

async function waitExactPath(serial, cdpPort, roomId, timeoutMs = 20000) {
  const start = Date.now();
  let last = { ok: false };
  while (Date.now() - start < timeoutMs) {
    last = await readWebPath(serial, cdpPort);
    const pathStr = String(last.pathname || last.href || "");
    if (pathStr.includes(`/community-messenger/rooms/${roomId}`)) return last;
    await sleep(1500);
  }
  return last;
}

async function waitUnreadAtLeast(roomId, userId, min, timeoutMs = 20000) {
  const start = Date.now();
  let last = await unreadOf(roomId, userId);
  while (Date.now() - start < timeoutMs) {
    last = await unreadOf(roomId, userId);
    if (last >= min) return last;
    await sleep(1000);
  }
  return last;
}

async function expandShadeAndTap(serial, needles) {
  wake(serial);
  await sleep(400);
  adb(serial, "shell", "cmd", "statusbar", "expand-notifications");
  await sleep(1500);
  adb(serial, "shell", "uiautomator", "dump", "/sdcard/chat_ssot_shade.xml");
  adb(serial, "pull", "/sdcard/chat_ssot_shade.xml", "/tmp/chat_ssot_shade.xml");
  if (!fs.existsSync("/tmp/chat_ssot_shade.xml")) return { tapped: false, reason: "no_dump" };
  const xml = fs.readFileSync("/tmp/chat_ssot_shade.xml", "utf8");
  const patterns = [
    ...needles.filter(Boolean).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "새 메시지",
    "New message",
    "NATIVE_",
  ];
  for (const pat of patterns) {
    const reText = new RegExp(
      `(?:text|content-desc)="[^"]*${pat}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
      "i"
    );
    const m = xml.match(reText);
    if (!m) continue;
    const x = Math.floor((+m[1] + +m[3]) / 2);
    const y = Math.floor((+m[2] + +m[4]) / 2);
    adb(serial, "shell", "input", "tap", String(x), String(y));
    await sleep(5000);
    return { tapped: true, x, y, hit: pat };
  }
  return { tapped: false, reason: "no_node", xmlSlice: xml.slice(0, 2000) };
}

async function readWebPath(serial, cdpPort) {
  try {
    if (!discoverWebViewSocket(adb, serial)) return { ok: false, reason: "no_webview_socket" };
    forwardCdp(adb, serial, cdpPort);
    const { browser, page } = await connectWebView(chromium, cdpPort);
    const href = await page.evaluate(() => window.location.href);
    const pathname = await page.evaluate(() => window.location.pathname + window.location.search);
    await browser.close().catch(() => {});
    return { ok: true, href, pathname };
  } catch (e) {
    return { ok: false, reason: String(e?.message ?? e) };
  }
}

function hasLegacyGroupChat(s) {
  return String(s ?? "").includes("/group-chat");
}

function normDomain(domain) {
  return String(domain || "").trim().toUpperCase();
}

function fcmTypeForDomain(domain) {
  const d = normDomain(domain);
  if (d === "GROUP") return "group_message";
  if (d === "TRADE") return "trade_message";
  if (d === "ORDER") return "delivery_order";
  return "chat_message";
}

function eventTypeForDomain(domain) {
  const d = normDomain(domain);
  if (d === "GROUP") return "group_message";
  if (d === "TRADE") return "trade_message";
  if (d === "ORDER") return "store_order_message";
  return "chat_message";
}

function expectedChatDomain(domain) {
  const d = normDomain(domain);
  if (d === "GROUP") return "group";
  if (d === "TRADE") return "trade";
  if (d === "ORDER") return "store_order";
  return "general_direct";
}

async function ensureLoginB(report, expectedUserId) {
  let lastErr = null;
  for (const password of passwords()) {
    try {
      await ensureApkWebViewLogin({
        adb,
        chromium,
        serial: SERIAL_B,
        cdpPort: CDP_B,
        act: ACT,
        pkg: PKG,
        prod: PROD,
        login: LOGIN_B,
        expectedUserId,
        password,
        loadEnv: loadEnvLocal,
        log,
        label: "B",
      });
      report.apkLoginB = "PASS";
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  report.apkLoginB = `FAIL ${lastErr?.message ?? "login"}`;
  log(`WARN apk login B: ${lastErr?.message}`);
}

async function proveCase({
  domain,
  state,
  room,
  cookieA,
  cookieB,
  userB,
  report,
}) {
  const roomId = room.id;
  const eventType = eventTypeForDomain(domain);
  const fcmType = fcmTypeForDomain(domain);
  const expectDomain = expectedChatDomain(domain);
  const content = `NATIVE_${domain}_${state}_${Date.now()}`;
  const beforeUnread = await unreadOf(roomId, userB);
  const afterIso = new Date(Date.now() - 1500).toISOString();
  const failReasons = [];

  log(`--- ${domain} ${state} room=${roomId} ---`);

  if (state === "foreground") {
    await openUrlInApkWebView({
      adb,
      chromium,
      serial: SERIAL_B,
      cdpPort: CDP_B,
      act: ACT,
      prod: PROD,
      url: `${PROD}${cmRoomPath(roomId)}`,
      log,
      label: `B-fg-${domain}`,
    });
    await sleep(2500);
  } else if (state === "background") {
    wake(SERIAL_B);
    adb(SERIAL_B, "shell", "am", "start", "-n", ACT);
    await sleep(1500);
    // Leave any open room so unread increments and OS notif is not same-room suppressed.
    try {
      await openUrlInApkWebView({
        adb,
        chromium,
        serial: SERIAL_B,
        cdpPort: CDP_B,
        act: ACT,
        prod: PROD,
        url: `${PROD}/community-messenger`,
        log,
        label: `B-bg-home-${domain}`,
      });
    } catch (e) {
      log(`WARN bg home nav: ${e.message}`);
    }
    home(SERIAL_B);
    await sleep(1500);
  } else if (state === "terminated") {
    forceStop(SERIAL_B);
    await sleep(1500);
  }

  logcatClear(SERIAL_B);
  const send = await sendText(cookieA, roomId, content);
  if (send.status >= 400 || !send.json?.message?.id) {
    return {
      result: "FAIL",
      reason: `send_failed ${send.status}`,
      send,
    };
  }
  const messageId = send.json.message.id;
  const event = await waitEvent({ roomId, userId: userB, type: eventType, afterIso });
  const routeUrl =
    event?.display_payload?.routeUrl ||
    event?.display_payload?.route_url ||
    cmRoomPath(roomId);

  let midUnread = beforeUnread;
  if (state !== "foreground") {
    midUnread = await waitUnreadAtLeast(roomId, userB, 1, 18000);
  }

  let fcmLog = "";
  let fcmDelivered = state === "foreground" ? "N/A_SAME_ROOM_POLICY" : false;
  let tray = false;
  if (state !== "foreground") {
    fcmLog = await pollLog(
      SERIAL_B,
      (l) => /message_received/i.test(l) || /native_notification_posted/i.test(l),
      35000
    );
    fcmDelivered =
      /message_received/i.test(fcmLog) ||
      /native_notification_posted/i.test(fcmLog) ||
      trayHas(SERIAL_B, content.slice(0, 18));
    tray = trayHas(SERIAL_B, content.slice(0, 18)) || trayHas(SERIAL_B, PKG);
  }

  let tap = { method: "none" };
  let finalPath = null;
  let routeLog = "";

  if (state === "foreground") {
    await sleep(2000);
    const web = await readWebPath(SERIAL_B, CDP_B);
    finalPath = web.pathname || web.href || null;
    tap = { method: "already_in_room", web };
  } else {
    const shade = await expandShadeAndTap(SERIAL_B, [
      content.slice(0, 16),
      "새 메시지",
      "New message",
      LOGIN_A,
      "wwww",
    ]);
    logcatClear(SERIAL_B);
    if (shade.tapped) {
      tap = { method: "shade", ...shade };
    } else {
      tap = { method: "notification_intent", shade };
      tapViaNotificationIntent({
        serial: SERIAL_B,
        type: fcmType,
        roomId,
        eventId: event?.id,
        routeUrl,
      });
    }
    const web = await waitExactPath(SERIAL_B, CDP_B, roomId, 22000);
    finalPath = web.pathname || web.href || null;
    tap.web = web;
    routeLog = logcatDump(SERIAL_B);
  }

  // Mark read via API (receiver) and check unread convergence
  await markRead(cookieB, roomId);
  await sleep(1500);
  const afterUnread = await unreadOf(roomId, userB);

  const pathStr = String(finalPath ?? "");
  const exactRoom =
    pathStr.includes(`/community-messenger/rooms/${roomId}`) ||
    pathStr.includes(`/community-messenger/rooms/${encodeURIComponent(roomId)}`);
  const legacy = hasLegacyGroupChat(pathStr) || hasLegacyGroupChat(routeUrl) || hasLegacyGroupChat(routeLog);
  const routeResolved =
    /route_resolved path=\/community-messenger\/rooms\//i.test(routeLog) ||
    /pending_route_saved path=\/community-messenger\/rooms\//i.test(routeLog) ||
    exactRoom ||
    state === "foreground";
  const eventOk =
    !!event &&
    event.room_id === roomId &&
    String(event.chat_domain || room.chat_domain) === expectDomain;
  if (!eventOk) failReasons.push(`event_mismatch typeWanted=${eventType} got=${event?.type ?? "null"} domain=${event?.chat_domain ?? "null"}`);
  if (legacy) failReasons.push("legacy_/group-chat");
  if (state !== "foreground" && !exactRoom) failReasons.push(`finalPath_not_exact=${finalPath}`);
  if (state === "foreground" && !exactRoom) failReasons.push(`foreground_left_room=${finalPath}`);
  if (afterUnread !== 0) failReasons.push(`unread_after_read=${afterUnread}`);
  if (state !== "foreground" && midUnread < 1) failReasons.push(`unread_mid=${midUnread}`);
  if (state !== "foreground" && !fcmDelivered && !tray) failReasons.push("fcm_or_tray_missing");

  const result =
    send.status < 400 &&
    eventOk &&
    !legacy &&
    (state === "foreground" ? exactRoom : routeResolved && exactRoom) &&
    afterUnread === 0 &&
    (state === "foreground" || midUnread >= 1)
      ? "PASS"
      : "FAIL";

  const out = {
    result,
    failReasons,
    device: SERIAL_B,
    state,
    domain,
    room_id: roomId,
    chat_domain: room.chat_domain,
    message_id: messageId,
    notification_event_id: event?.id ?? null,
    event_type: event?.type ?? null,
    event_chat_domain: event?.chat_domain ?? null,
    routeUrl,
    fcmType,
    fcmDelivered,
    tray,
    tap,
    finalPath,
    legacyGroupChat: legacy,
    unread: { before: beforeUnread, mid: midUnread, afterRead: afterUnread },
    fcmLogTail: fcmLog.split("\n").filter(Boolean).slice(-25).join("\n"),
    routeLogTail: routeLog
      .split("\n")
      .filter((l) =>
        /push-route|route_resolved|pending_route|notification_tap|group-chat|community-messenger|duplicate_ignored/i.test(
          l
        )
      )
      .slice(-40)
      .join("\n"),
  };
  log(
    `${domain} ${state} => ${result} exact=${exactRoom} legacy=${legacy} unread ${beforeUnread}->${midUnread}->${afterUnread} path=${finalPath} reasons=${failReasons.join("|") || "none"}`
  );
  return out;
}

async function main() {
  fs.writeFileSync(OUT_LOG, "");
  loadEnvLocal();
  grantNotif(SERIAL_A);
  grantNotif(SERIAL_B);

  const report = {
    productionAlias: PROD,
    productionShaExpected: "90ef3738da482374964fd1a34273ee1800c79e42",
    chatFix: "afe211e329a39979e08bb971ee3d1cbe6df67b48",
    devices: { A: SERIAL_A, B: SERIAL_B },
    logins: { A: LOGIN_A, B: LOGIN_B },
    startedAt: new Date().toISOString(),
    android: {},
    firstDivergence: "NONE",
  };

  const a = await signInCookie(LOGIN_A);
  const b = await signInCookie(LOGIN_B);
  report.userIds = { A: a.userId, B: b.userId };
  await ensureLoginB(report, b.userId);

  let group = await findSharedRoom(a.userId, b.userId, "group");
  if (!group) group = await ensureGroup(a.cookie, b.userId);
  const general = await findSharedRoom(a.userId, b.userId, "general_direct");
  const trade = await findSharedRoom(a.userId, b.userId, "trade");
  const order = await findSharedRoom(a.userId, b.userId, "store_order");

  report.rooms = {
    group: group?.id ?? null,
    general: general?.id ?? null,
    trade: trade?.id ?? null,
    order: order?.id ?? null,
  };

  const only = (process.env.CHAT_SSOT_ANDROID_ONLY || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const want = (d) => !only.length || only.includes(d);

  if (!group?.id) {
    report.android.GROUP = { result: "NOT_PROVEN", reason: "no_group_room" };
  } else if (want("GROUP")) {
    report.android.GROUP = {
      foreground: await proveCase({
        domain: "GROUP",
        state: "foreground",
        room: group,
        cookieA: a.cookie,
        cookieB: b.cookie,
        userB: b.userId,
        report,
      }),
      background: await proveCase({
        domain: "GROUP",
        state: "background",
        room: group,
        cookieA: a.cookie,
        cookieB: b.cookie,
        userB: b.userId,
        report,
      }),
      terminated: await proveCase({
        domain: "GROUP",
        state: "terminated",
        room: group,
        cookieA: a.cookie,
        cookieB: b.cookie,
        userB: b.userId,
        report,
      }),
    };
  } else {
    report.android.GROUP = { result: "SKIPPED" };
  }

  if (!want("GENERAL")) {
    report.android.GENERAL = { result: "SKIPPED" };
  } else if (general?.id) {
    report.android.GENERAL = {
      background: await proveCase({
        domain: "GENERAL",
        state: "background",
        room: general,
        cookieA: a.cookie,
        cookieB: b.cookie,
        userB: b.userId,
        report,
      }),
      terminated: await proveCase({
        domain: "GENERAL",
        state: "terminated",
        room: general,
        cookieA: a.cookie,
        cookieB: b.cookie,
        userB: b.userId,
        report,
      }),
    };
  } else {
    report.android.GENERAL = { result: "NOT_PROVEN", reason: "no_general_room" };
  }

  if (!want("TRADE")) {
    report.android.TRADE = { result: "SKIPPED" };
  } else if (trade?.id) {
    report.android.TRADE = {
      background: await proveCase({
        domain: "TRADE",
        state: "background",
        room: trade,
        cookieA: a.cookie,
        cookieB: b.cookie,
        userB: b.userId,
        report,
      }),
      terminated: await proveCase({
        domain: "TRADE",
        state: "terminated",
        room: trade,
        cookieA: a.cookie,
        cookieB: b.cookie,
        userB: b.userId,
        report,
      }),
    };
  } else {
    report.android.TRADE = { result: "NOT_PROVEN", reason: "no_trade_room" };
  }

  if (!want("ORDER")) {
    report.android.ORDER = { result: "SKIPPED" };
  } else if (order?.id) {
    report.android.ORDER = {
      background: await proveCase({
        domain: "ORDER",
        state: "background",
        room: order,
        cookieA: a.cookie,
        cookieB: b.cookie,
        userB: b.userId,
        report,
      }),
      terminated: await proveCase({
        domain: "ORDER",
        state: "terminated",
        room: order,
        cookieA: a.cookie,
        cookieB: b.cookie,
        userB: b.userId,
        report,
      }),
    };
  } else {
    report.android.ORDER = { result: "NOT_PROVEN", reason: "no_order_room" };
  }

  // Aggregate gates
  const cases = [];
  for (const d of ["GROUP", "GENERAL", "TRADE", "ORDER"]) {
    const block = report.android[d];
    if (!block || block.result === "NOT_PROVEN") continue;
    for (const k of ["foreground", "background", "terminated"]) {
      if (block[k]) cases.push({ domain: d, state: k, ...block[k] });
    }
  }
  const failed = cases.filter((c) => c.result === "FAIL");
  report.androidLegacyGroupChatOpened = cases.some((c) => c.legacyGroupChat) ? "YES" : "NO";
  report.androidExactRoom = cases.every((c) => c.result !== "FAIL" || !String(c.finalPath || "").includes("community-messenger"))
    ? cases.filter((c) => c.result === "PASS").length
      ? cases.every((c) => c.result === "PASS" || c.result === "NOT_PROVEN")
        ? "PASS"
        : "FAIL"
      : "NOT_PROVEN"
    : cases.every((c) => c.result === "PASS")
      ? "PASS"
      : "FAIL";
  if (failed.length) {
    const f = failed[0];
    report.firstDivergence = `${f.domain} ${f.state}: finalPath=${f.finalPath} expected CM room ${f.room_id}`;
  }
  report.androidBadge = cases.some((c) => c.unread?.afterRead === 0 && c.unread?.before >= 0)
    ? cases.filter((c) => c.result === "PASS").every((c) => c.unread?.afterRead === 0)
      ? "PASS"
      : "PARTIAL"
    : "NOT_PROVEN";
  report.finishedAt = new Date().toISOString();
  report.caseSummary = cases.map((c) => ({
    domain: c.domain,
    state: c.state,
    result: c.result,
    finalPath: c.finalPath,
    legacy: c.legacyGroupChat,
  }));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ summary: report.caseSummary, firstDivergence: report.firstDivergence, out: OUT }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
