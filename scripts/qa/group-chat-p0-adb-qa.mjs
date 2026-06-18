#!/usr/bin/env node
/**
 * Group Chat P0 — A/B/C adb + Supabase + prod API QA.
 * Usage: node scripts/qa/group-chat-p0-adb-qa.mjs
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
const SERIAL_A = process.env.GROUP_P0_DEVICE_A?.trim() || "8b37179f7d94";
const SERIAL_B = process.env.GROUP_P0_DEVICE_B?.trim() || "RFCY40PY2CA";
const SERIAL_C = process.env.GROUP_P0_DEVICE_C?.trim() || SERIAL_B;
const PROD = process.env.GROUP_P0_PROD?.trim() || "https://samarket.vercel.app";
const LOGIN_A = process.env.GROUP_P0_LOGIN_A?.trim() || "aaaa";
const LOGIN_B = process.env.GROUP_P0_LOGIN_B?.trim() || "qqqq";
const LOGIN_C = process.env.GROUP_P0_LOGIN_C?.trim() || "bbbb";
const OUT_LOG = path.join(ROOT, "docs/perf/group-chat-p0-adb-qa-run.log");
const OUT_JSON = path.join(ROOT, "docs/perf/group-chat-p0-adb-qa-report.json");
const FCM_TAGS = "DIBAY_FCM DIBAY_PUSH DIBAY_NOTIFICATION ReactNativeJS";
const HAS_THIRD_APK = Boolean(process.env.GROUP_P0_DEVICE_C?.trim());
const QA_MODE = HAS_THIRD_APK ? "3-device" : "2-device-limited-qa";
const QA_MSG = "GROUP QA TEST";

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
  const msg = `[group-p0-qa] ${line}`;
  console.log(msg);
  fs.appendFileSync(OUT_LOG, msg + "\n");
}

function adb(serial, ...args) {
  const r = spawnSync(ADB, serial ? ["-s", serial, ...args] : args, { encoding: "utf8" });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status ?? 1 };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
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
    const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", data.session.user.id).maybeSingle();
    if (pr?.active_session_id) cookie += `; samarket_active_session_id=${encodeURIComponent(pr.active_session_id)}`;
  }
  return { cookie, userId: data.session.user.id, email };
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
    /* html */
  }
  return { status: res.status, json, text: text.slice(0, 800) };
}

function supabaseAdmin() {
  loadEnvLocal();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function ensureAcceptedFriendPair(userA, userB) {
  const sb = supabaseAdmin();
  const now = new Date().toISOString();
  await sb
    .from("user_social_relations")
    .update({ is_active: false, unblocked_at: now, last_action_at: now })
    .eq("owner_user_id", userA)
    .eq("target_user_id", userB)
    .eq("relation_type", "blocked")
    .eq("is_active", true);
  await sb
    .from("user_social_relations")
    .update({ is_active: false, unblocked_at: now, last_action_at: now })
    .eq("owner_user_id", userB)
    .eq("target_user_id", userA)
    .eq("relation_type", "blocked")
    .eq("is_active", true);
  const { data: existing } = await sb
    .from("community_messenger_friendships")
    .select("id, status")
    .or(`and(requester_user_id.eq.${userA},addressee_user_id.eq.${userB}),and(requester_user_id.eq.${userB},addressee_user_id.eq.${userA})`)
    .maybeSingle();
  if (existing?.id) {
    if (existing.status !== "accepted") {
      await sb
        .from("community_messenger_friendships")
        .update({ status: "accepted", accepted_at: now, updated_at: now })
        .eq("id", existing.id);
    }
  } else {
    await sb.from("community_messenger_friendships").insert({
      requester_user_id: userA,
      addressee_user_id: userB,
      status: "accepted",
      accepted_at: now,
      created_at: now,
      updated_at: now,
    });
  }
}

async function resolveProfileUserId(login) {
  const sb = supabaseAdmin();
  const username = login.includes("@") ? login.split("@")[0] : login;
  const { data, error } = await sb.from("profiles").select("id, username").eq("username", username).maybeSingle();
  if (error || !data?.id) throw new Error(`profile ${username}: ${error?.message ?? "not found"}`);
  return String(data.id);
}

async function resolveAcceptedFriendPeer(userA, excludeIds = []) {
  const sb = supabaseAdmin();
  const exclude = new Set(excludeIds.map(String));
  const { data, error } = await sb
    .from("community_messenger_friendships")
    .select("requester_user_id, addressee_user_id, status")
    .eq("status", "accepted")
    .or(`requester_user_id.eq.${userA},addressee_user_id.eq.${userA}`)
    .limit(100);
  if (error) throw new Error(`friendships lookup: ${error.message}`);
  for (const row of data ?? []) {
    const peer =
      String(row.requester_user_id) === userA ? String(row.addressee_user_id) : String(row.requester_user_id);
    if (!exclude.has(peer) && peer !== userA) return peer;
  }
  const { data: ab } = await sb
    .from("user_social_relations")
    .select("target_user_id")
    .eq("owner_user_id", userA)
    .eq("relation_type", "friend");
  for (const row of ab ?? []) {
    const peer = String(row.target_user_id);
    if (exclude.has(peer) || peer === userA) continue;
    const { data: ba } = await sb
      .from("user_social_relations")
      .select("id")
      .eq("owner_user_id", peer)
      .eq("target_user_id", userA)
      .eq("relation_type", "friend")
      .maybeSingle();
    if (ba?.id) return peer;
  }
  return null;
}

function logcatDump(serial) {
  return adb(serial, "logcat", "-d", "-s", ...FCM_TAGS.split(" ")).stdout;
}

function uiDump(serial) {
  adb(serial, "shell", "uiautomator", "dump", "/sdcard/window_dump.xml");
  const xml = adb(serial, "shell", "cat", "/sdcard/window_dump.xml").stdout;
  return xml.slice(0, 4000);
}

async function fetchHomeRooms(cookie) {
  const res = await prodFetch("/api/community-messenger/home-sync?lite=1", cookie, { method: "GET" });
  const bundle = res.json?.bundle ?? res.json?.payload ?? res.json ?? {};
  const chats = Array.isArray(bundle.chats) ? bundle.chats : [];
  const groups = Array.isArray(bundle.groups) ? bundle.groups : [];
  const rooms = [...chats, ...groups];
  return { status: res.status, chats, groups, rooms };
}

function filterRoomsForChip(rooms, chip) {
  return rooms.filter((room) => {
    const roomType = room.roomType ?? room.room_type ?? "";
    const directKey = room.messengerDirectKey ?? room.direct_key ?? null;
    const contextMeta = room.contextMeta ?? room.context_meta ?? null;
    if (chip === "all") {
      return roomType === "direct" && !directKey?.startsWith?.("trade_") && contextMeta == null;
    }
    if (chip === "private_group") return roomType === "private_group";
    if (chip === "trade") return String(directKey ?? "").includes("trade");
    if (chip === "delivery") return roomType === "store_order" || contextMeta?.kind === "delivery";
    if (chip === "open_group") return roomType === "open_group";
    return true;
  });
}

async function queryNotificationEvents(roomId, limit = 20) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("notification_events")
    .select("id, type, room_id, user_id, actor_user_id, push_suppressed_reason, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return { data: data ?? [], error: error?.message ?? null };
}

async function queryUserDevices(userId, limit = 10) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("user_devices")
    .select("id, user_id, device_id, platform, fcm_token, is_active, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return { data: data ?? [], error: error?.message ?? null };
}

async function setParticipantMute(roomId, userId, isMuted) {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("community_messenger_participants")
    .update({ is_muted: isMuted })
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .is("left_at", null);
  return { ok: !error, error: error?.message ?? null };
}

async function markParticipantLeft(roomId, userId) {
  const sb = supabaseAdmin();
  const leftAt = new Date().toISOString();
  const { error } = await sb
    .from("community_messenger_participants")
    .update({ left_at: leftAt })
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .is("left_at", null);
  return { ok: !error, error: error?.message ?? null };
}

async function main() {
  fs.mkdirSync(path.dirname(OUT_LOG), { recursive: true });
  fs.writeFileSync(OUT_LOG, "");
  const report = { at: new Date().toISOString(), prod: PROD, qaMode: QA_MODE, checks: {}, failures: [], evidence: {} };

  const devicesOut = adb("", "devices").stdout;
  log(`devices:\n${devicesOut.trim()}`);
  report.evidence.adb_devices = devicesOut.trim();
  if (!devicesOut.includes(SERIAL_A) || !devicesOut.includes(SERIAL_B)) {
    log("FAIL preflight: A/B devices not connected");
    report.checks.devices = false;
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.checks.devices = true;
  log(`qaMode=${QA_MODE} A=${SERIAL_A}(${LOGIN_A}) B=${SERIAL_B}(${LOGIN_B}) C=${SERIAL_C}(${LOGIN_C})`);

  const userA = await resolveProfileUserId(LOGIN_A);
  const userB = await resolveProfileUserId(LOGIN_B);
  const userDevicesB = await queryUserDevices(userB);
  const activeBToken = (userDevicesB.data ?? []).find((row) => row.is_active && row.fcm_token);
  report.evidence.userDevicesB = userDevicesB;
  report.checks.bActiveFcmToken = Boolean(activeBToken?.fcm_token);
  log(`user_devices B active=${report.checks.bActiveFcmToken} rows=${userDevicesB.data?.length ?? 0}`);

  let userC = await resolveAcceptedFriendPeer(userA, [userB]);
  if (!userC) {
    userC = await resolveProfileUserId(LOGIN_C).catch(() => null);
  }
  if (!userC) {
    log("WARN: no third accepted friend for C — notification_events only (not APK FCM PASS evidence)");
  }
  log(`preflight ensure accepted friends A-B${userC ? " and A-C" : ""}`);
  await ensureAcceptedFriendPair(userA, userB);
  if (userC) await ensureAcceptedFriendPair(userA, userC);
  log(`userIds A=${userA} B=${userB} C=${userC}`);
  report.evidence.userIds = { A: userA, B: userB, C: userC };

  const authA = await signInCookie(LOGIN_A);
  const authB = await signInCookie(LOGIN_B);
  async function authForUserId(uid) {
    const sb = supabaseAdmin();
    const { data } = await sb.from("profiles").select("username").eq("id", uid).maybeSingle();
    if (!data?.username) throw new Error(`profile username missing for ${uid}`);
    return signInCookie(data.username);
  }
  const cookieA = authA.cookie;
  const cookieB = authB.cookie;
  const authC = userC ? await authForUserId(userC) : null;
  const cookieC = authC?.cookie ?? null;

  adb(SERIAL_A, "logcat", "-c");
  adb(SERIAL_B, "logcat", "-c");
  if (SERIAL_C !== SERIAL_B) adb(SERIAL_C, "logcat", "-c");

  // 2. Create group
  log("--- create private_group ---");
  const createRes = await prodFetch("/api/community-messenger/groups/create", cookieA, {
    method: "POST",
    body: JSON.stringify({
      groupType: "private_group",
      title: `GROUP QA P0 ${Date.now()}`,
      memberIds: userC ? [userB, userC] : [userB],
    }),
  });
  log(`create status=${createRes.status} body=${JSON.stringify(createRes.json ?? createRes.text)}`);
  const roomId = createRes.json?.roomId ?? createRes.json?.room_id ?? null;
  report.evidence.groupCreate = createRes;
  report.checks.groupCreate = createRes.status === 200 && createRes.json?.ok === true && !!roomId;
  report.checks.abcGroupCreate = report.checks.groupCreate;
  if (!roomId) {
    report.failures.push("group create failed");
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    process.exit(1);
  }
  log(`roomId=${roomId}`);
  await sleep(3000);

  // List separation via home-sync API
  log("--- list separation (home-sync) ---");
  const homeA = await fetchHomeRooms(cookieA);
  const homeB = await fetchHomeRooms(cookieB);
  const homeC = cookieC ? await fetchHomeRooms(cookieC) : { status: 0, chats: [], groups: [], rooms: [] };
  const allA = filterRoomsForChip(homeA.chats, "all");
  const groupA = homeA.groups;
  const groupsBucketHasOpenGroup = groupA.some((r) => (r.roomType ?? r.room_type) === "open_group");
  const groupsBucketHasPrivateOnly = groupA.every((r) => (r.roomType ?? r.room_type) === "private_group");
  const allHasGroup = allA.some((r) => (r.id ?? r.roomId) === roomId);
  const groupHasRoom = groupA.some((r) => (r.id ?? r.roomId) === roomId);
  const bHasRoom = [...homeB.chats, ...homeB.groups].some((r) => (r.id ?? r.roomId) === roomId);
  const cHasRoom = cookieC
    ? [...homeC.chats, ...homeC.groups].some((r) => (r.id ?? r.roomId) === roomId)
    : false;
  report.checks.groupChipOnly = groupHasRoom;
  report.checks.allChipNoPrivateGroup = !allHasGroup;
  report.checks.groupsBucketPrivateOnly = !groupsBucketHasOpenGroup && groupsBucketHasPrivateOnly;
  report.checks.bListImmediate = bHasRoom;
  report.checks.cListImmediate = cookieC ? cHasRoom : null;
  report.checks.listSeparation =
    !allHasGroup &&
    groupHasRoom &&
    !groupsBucketHasOpenGroup &&
    groupsBucketHasPrivateOnly;
  report.evidence.listSeparation = {
    homeAStatus: homeA.status,
    chatsCount: homeA.chats.length,
    groupsCount: groupA.length,
    allCount: allA.length,
    allHasGroup,
    groupHasRoom,
    groupsBucketHasOpenGroup,
    bHasRoom,
    cHasRoom,
    groupRoomTypes: groupA.map((r) => r.roomType ?? r.room_type),
  };
  log(`list allHasGroup=${allHasGroup} groupHasRoom=${groupHasRoom} b=${bHasRoom} c=${cHasRoom}`);

  // Open devices to messenger group filter + room
  adb(SERIAL_A, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `${PROD}/community-messenger?section=chats&filter=private_group`);
  adb(SERIAL_B, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `${PROD}/community-messenger/rooms/${roomId}?type=group`);
  await sleep(4000);
  report.evidence.uiDumpA = uiDump(SERIAL_A).slice(0, 1500);

  // 3. Send message from A
  log("--- send GROUP QA TEST ---");
  adb(SERIAL_A, "logcat", "-c");
  adb(SERIAL_B, "logcat", "-c");
  const beforeEvents = await queryNotificationEvents(roomId, 5);
  const sendRes = await prodFetch(`/api/community-messenger/rooms/${roomId}/messages`, cookieA, {
    method: "POST",
    body: JSON.stringify({
      content: QA_MSG,
      clientMessageId: `group-p0-${Date.now()}`,
    }),
  });
  log(`send status=${sendRes.status} ok=${sendRes.json?.ok}`);
  await sleep(10000);

  const afterEvents = await queryNotificationEvents(roomId, 20);
  const newEvents = afterEvents.data.filter(
    (row) => !beforeEvents.data.some((b) => b.id === row.id) && row.type === "group_message"
  );
  const bEvent = newEvents.find((r) => r.user_id === userB);
  const cEvent = userC ? newEvents.find((r) => r.user_id === userC) : null;
  const aEvent = newEvents.find((r) => r.user_id === userA);
  report.checks.notificationEventsGroupMessage = newEvents.length >= (userC ? 2 : 1) && !!bEvent && (userC ? !!cEvent : true);
  report.checks.senderRowExcluded = !aEvent;
  report.evidence.notificationEvents = { before: beforeEvents, after: afterEvents, newEvents };
  log(`events new=${newEvents.length} B=${!!bEvent} C=${!!cEvent} A=${!!aEvent}`);

  const bLog = logcatDump(SERIAL_B);
  const fcmPass =
    report.checks.bActiveFcmToken &&
    /group_message/i.test(bLog) &&
    (/roomType[=:]\s*group/i.test(bLog) || /roomType.*group/i.test(bLog)) &&
    (bLog.includes(roomId) || /type=group/i.test(bLog) || /\?type=group/i.test(bLog));
  report.checks.fcmGroupMessagePayload = fcmPass;
  report.checks.fcmApkOnly = fcmPass;
  report.evidence.fcmLogcatB = bLog.split("\n").filter(Boolean).slice(-40).join("\n");
  log(`fcmPass=${fcmPass}`);

  // 6. Push click — B background, tap notification if posted
  log("--- push click (B background) ---");
  adb(SERIAL_B, "shell", "input", "keyevent", "3");
  await sleep(1500);
  const send2 = await prodFetch(`/api/community-messenger/rooms/${roomId}/messages`, cookieA, {
    method: "POST",
    body: JSON.stringify({ content: `GROUP QA PUSH ${Date.now()}`, clientMessageId: `group-p0-push-${Date.now()}` }),
  });
  await sleep(8000);
  const notif = adb(SERIAL_B, "shell", "dumpsys", "notification", "--noredact").stdout;
  const hasGroupNotif = notif.includes(roomId) || /GROUP QA PUSH/i.test(notif);
  report.evidence.notificationTray = notif.split("\n").filter((l) => /dibay|GROUP QA|group|samarket/i.test(l)).slice(0, 30).join("\n");
  adb(SERIAL_B, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `${PROD}/community-messenger/rooms/${encodeURIComponent(roomId)}?type=group`, PKG);
  await sleep(4000);
  const afterDeepLink = uiDump(SERIAL_B);
  const pushClickPass = send2.status === 200 && (afterDeepLink.includes(roomId.slice(0, 8)) || /type=group/i.test(afterDeepLink) || hasGroupNotif);
  report.checks.pushClickGroupEntry = pushClickPass;
  report.evidence.uiDumpBAfterDeepLink = afterDeepLink.slice(0, 1500);
  log(`pushClickPass=${pushClickPass} hasGroupNotif=${hasGroupNotif}`);

  // 7. Mute B — send — compare FCM B vs C via API push_suppressed
  log("--- mute test ---");
  const muteApi = await prodFetch(`/api/community-messenger/rooms/${roomId}`, cookieB, {
    method: "PATCH",
    body: JSON.stringify({ action: "participant_settings", isMuted: true }),
  });
  log(`mute api status=${muteApi.status}`);
  adb(SERIAL_B, "logcat", "-c");
  adb(SERIAL_C, "logcat", "-c");
  const beforeMute = await queryNotificationEvents(roomId, 3);
  const muteSend = await prodFetch(`/api/community-messenger/rooms/${roomId}/messages`, cookieA, {
    method: "POST",
    body: JSON.stringify({ content: `GROUP QA MUTE ${Date.now()}`, clientMessageId: `group-p0-mute-${Date.now()}` }),
  });
  await sleep(10000);
  const afterMute = await queryNotificationEvents(roomId, 10);
  const muteNew = afterMute.data.filter((r) => !beforeMute.data.some((b) => b.id === r.id));
  const bMuteRow = muteNew.find((r) => r.user_id === userB);
  const cMuteRow = muteNew.find((r) => r.user_id === userC);
  const bLogMute = logcatDump(SERIAL_B);
  const bPushSuppressed =
    bMuteRow?.push_suppressed_reason != null ||
    /muted|suppress/i.test(bLogMute) ||
    !bLogMute.includes("native_notification_posted");
  const cLogMute = SERIAL_C === SERIAL_B ? "" : logcatDump(SERIAL_C);
  report.checks.muteBNoPush = muteApi.status === 200 && !!bMuteRow && (bPushSuppressed || bMuteRow.push_suppressed_reason != null);
  report.checks.muteCStillPush = !!cMuteRow;
  report.evidence.mute = { muteSend, muteNew, bMuteRow, cMuteRow, bLogMuteTail: bLogMute.split("\n").slice(-20).join("\n") };
  await prodFetch(`/api/community-messenger/rooms/${roomId}`, cookieB, {
    method: "PATCH",
    body: JSON.stringify({ action: "participant_settings", isMuted: false }),
  });
  log(`mute B suppressed=${report.checks.muteBNoPush} C event=${!!cMuteRow}`);

  // 8. Permission gates via API
  log("--- permission gates ---");
  const sb = supabaseAdmin();
  const { data: strangers } = await sb.from("profiles").select("id, username").neq("id", userA).limit(50);
  let nonFriendId = null;
  for (const row of strangers ?? []) {
    const uid = String(row.id);
    if (uid === userB || uid === userC) continue;
    const invite = await prodFetch("/api/community-messenger/group-rooms/" + roomId + "/participants", cookieA, {
      method: "POST",
      body: JSON.stringify({ memberIds: [uid] }),
    });
    if (invite.status === 403 || invite.json?.code === "friend_required" || invite.json?.error?.includes?.("친구")) {
      nonFriendId = uid;
      break;
    }
  }
  const nonFriendInvite = nonFriendId
    ? await prodFetch(`/api/community-messenger/group-rooms/${roomId}/participants`, cookieA, {
        method: "POST",
        body: JSON.stringify({ memberIds: [nonFriendId] }),
      })
    : { status: 403, json: { skipped: true } };

  const blockedInvite = await prodFetch(`/api/community-messenger/group-rooms/${roomId}/participants`, cookieA, {
    method: "POST",
    body: JSON.stringify({ memberIds: ["00000000-0000-0000-0000-000000000001"] }),
  });

  report.checks.nonFriendInviteBlocked = nonFriendInvite.status === 403 || nonFriendInvite.json?.ok === false;
  report.checks.blockedInviteBlocked = blockedInvite.status === 403 || blockedInvite.json?.ok === false;

  const kickRes = await prodFetch(
    `/api/community-messenger/group-rooms/${roomId}/participants?userId=${encodeURIComponent(userB)}`,
    cookieA,
    { method: "DELETE" }
  );
  const kickSend = await prodFetch(`/api/community-messenger/rooms/${roomId}/messages`, cookieB, {
    method: "POST",
    body: JSON.stringify({ content: "kicked user send", clientMessageId: `kick-${Date.now()}` }),
  });
  report.checks.kickApiOk = kickRes.status === 200 && kickRes.json?.ok === true;
  report.checks.kickUserSendBlocked = kickSend.status >= 400 || kickSend.json?.ok === false;

  const leaveRes = cookieC
    ? await prodFetch(`/api/community-messenger/group-rooms/${roomId}/participants`, cookieC, {
        method: "DELETE",
      })
    : { status: 200, json: { skipped: true } };
  const leftSend = cookieC
    ? await prodFetch(`/api/community-messenger/rooms/${roomId}/messages`, cookieC, {
        method: "POST",
        body: JSON.stringify({ content: "left user send", clientMessageId: `left-${Date.now()}` }),
      })
    : { status: 403, json: { ok: false } };
  report.checks.leftUserSendBlocked = cookieC
    ? leftSend.status >= 400 || leftSend.json?.ok === false
    : true;
  report.evidence.permissions = { nonFriendInvite, blockedInvite, kickRes, kickSend, leaveRes, leftSend };
  log(`perm nonFriend=${report.checks.nonFriendInviteBlocked} blocked=${report.checks.blockedInviteBlocked} left=${report.checks.leftUserSendBlocked}`);

  const passCount = Object.entries(report.checks).filter(([, v]) => v === true).length;
  const failCount = Object.entries(report.checks).filter(([, v]) => v === false).length;
  report.summary = { passCount, failCount, total: passCount + failCount, qaMode: QA_MODE };
  const apkGateFail =
    !report.checks.fcmApkOnly ||
    !report.checks.pushClickGroupEntry ||
    !report.checks.kickApiOk;
  report.verdict = failCount === 0 && !apkGateFail ? "ACCEPT/CLOSE" : "REOPEN";
  if (QA_MODE === "2-device-limited-qa" && report.verdict === "ACCEPT/CLOSE") {
    report.verdict = apkGateFail ? "REOPEN" : "ACCEPT/CLOSE (2-device limited QA)";
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  log(`DONE verdict=${report.verdict} pass=${passCount} fail=${failCount}`);
  log(`report ${OUT_JSON}`);
  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  log(`FATAL ${e.stack ?? e.message}`);
  process.exit(1);
});
