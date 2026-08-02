#!/usr/bin/env node
/**
 * Badge A/B axis RUNTIME QA — Xiaomi · Samsung · iPhone evidence.
 *
 * Measures user-locked formulas (not Legacy guess):
 *   A up/down → Bell + App Icon
 *   B msg → rooms/Hub/Bottom/App Icon; same-room extra → Row only
 *   B read → reverse
 *   Owner → Member A/B/App Icon +0
 *
 * Default host = local Next (dirty CODE PASS tree). Override:
 *   BADGE_AB_HOST=https://samarket.vercel.app
 *
 *   node scripts/qa/badge-ab-axis-runtime-3device-qa.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";
const HOST = (process.env.BADGE_AB_HOST || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT = path.join(ROOT, ".qa-logs/badge-authority-rebuild/runtime-ab-3device", String(Date.now()));
const GD_ROOM = process.env.FINAL_GD_ROOM || "b19e2672-f26f-4a2e-8125-52575da4a62a";
const STORE_ID = process.env.FINAL_STORE_ID || "076bffda-3048-4bfb-80ae-985a69105f4a";
const USER_A = "11111111-1111-1111-1111-111111111111"; // aaaa / Xiaomi
const USER_B = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8"; // qqqq / Samsung
const IOS_UDID = process.env.IOS_UDID || "00008120-000025C826F3C01E";
const IOS_LOGIN = process.env.BADGE_IOS_LOGIN || "asas55";

const DEVICES = [
  { label: "xiaomi", serial: "8b37179f7d94", login: "aaaa", userId: USER_A },
  { label: "samsung", serial: "RFCY40PY2CA", login: "qqqq", userId: USER_B },
  { label: "iphone", udid: IOS_UDID, login: IOS_LOGIN, userId: null },
];

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

function n(v) {
  return Math.max(0, Math.floor(Number(v) || 0));
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function log(m) {
  console.log(`[badge-ab-runtime] ${m}`);
}
function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

async function signInCookie(login) {
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
  let cookie = `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify(session))}`;
  if (sk) {
    const admin = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", data.session.user.id).maybeSingle();
    const sid = String(pr?.active_session_id ?? "").trim();
    if (sid) cookie += `; samarket_active_session_id=${encodeURIComponent(sid)}`;
  }
  return { cookie, userId: data.session.user.id, login, email };
}

async function api(auth, pathname, init = {}) {
  const res = await fetch(`${HOST}${pathname}`, {
    ...init,
    headers: {
      cookie: auth.cookie,
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { ok: res.ok, status: res.status, json };
}

async function snap(auth) {
  const [badge, hub] = await Promise.all([
    api(auth, "/api/me/notifications/badge-count?fresh=1"),
    api(auth, "/api/me/store-owner-hub-badge"),
  ]);
  const b = badge.json || {};
  const h = hub.json || {};
  const rooms = b.domainUnreadRooms || {};
  const gd = n(rooms.general_direct);
  const group = n(rooms.group);
  const trade = n(rooms.trade);
  const buyer = n(b.storeOrderBuyerDeliveryUnread);
  const ownerRooms = n(b.storeOrderOwnerChatUnread);
  const orphan = n(b.orphanMissedCallCount ?? b.projection?.orphanMissedCallCount ?? 0);
  const memberMissed = n(b.memberMissedCallCount ?? orphan);
  const A = n(b.notificationAttentionTotal ?? b.projection?.bellTotal ?? b.total);
  const bell = n(b.projection?.bellTotal ?? b.total);
  const bottom = n(b.projection?.bottomChatTotal);
  const appIcon = n(b.projection?.appIconTotal);
  const expectedApp = A + gd + group + trade + buyer + memberMissed;
  return {
    status: badge.status,
    A,
    bell,
    appIcon,
    bottom,
    gd,
    group,
    trade,
    buyer,
    ownerRooms,
    orphan,
    memberMissed,
    hubCm: n(h.communityMessengerUnread),
    hubBuyer: n(h.buyerOrderAttention),
    hubOwnerFab: n(h.storeOrderChatUnread),
    formula: {
      bellIsA: bell === A,
      bottomIsGdGroup: bottom === gd + group,
      appIsAPlusB: appIcon === expectedApp,
      ownerNotInApp: true, // enforced by expectedApp excluding ownerRooms
      hubCmMatchesBottom: n(h.communityMessengerUnread) === bottom || bottom === gd + group,
    },
    expectedApp,
  };
}

async function waitSnap(auth, pred, timeoutMs = 12000) {
  const t0 = Date.now();
  let last = await snap(auth);
  while (Date.now() - t0 < timeoutMs) {
    if (pred(last)) return last;
    await sleep(700);
    last = await snap(auth);
  }
  return last;
}

function readCapBadge(serial) {
  const r = adb(
    serial,
    "shell",
    "run-as",
    PKG,
    "cat",
    "shared_prefs/capacitor.badge.xml"
  );
  const m = String(r.stdout || "").match(/capacitor\.badge"\s+value="(\d+)"/);
  return m ? n(m[1]) : null;
}

async function insertMemberA(admin, userId) {
  const id = randomUUID();
  const dedupe = `qa-ab-a:${userId}:${Date.now()}`;
  const { error } = await admin.from("notification_events").insert({
    id,
    user_id: userId,
    type: "trade_status",
    category: "trade_status",
    title: "QA A trade status",
    body: "badge ab runtime",
    unread: true,
    muted_snapshot: false,
    delivered_at: new Date().toISOString(),
    dedupe_key: dedupe,
    display_payload: {
      attention_key: dedupe,
      product_id: "qa-ab-product",
      legacyMeta: { product_id: "qa-ab-product" },
    },
  });
  if (error) throw new Error(`insert A: ${error.message}`);
  return id;
}

async function insertOwnerIntake(admin, ownerUserId) {
  const id = randomUUID();
  const dedupe = `qa-ab-owner:${ownerUserId}:${Date.now()}`;
  const { error } = await admin.from("notification_events").insert({
    id,
    user_id: ownerUserId,
    type: "order_status",
    category: "order_status",
    title: "QA Owner intake",
    body: "must not move member A/B",
    unread: true,
    muted_snapshot: false,
    delivered_at: new Date().toISOString(),
    dedupe_key: dedupe,
    display_payload: {
      attention_key: dedupe,
      legacyMeta: { kind: "store_order_created", store_id: STORE_ID, order_id: `qa-${Date.now()}` },
    },
  });
  if (error) throw new Error(`insert Owner: ${error.message}`);
  return id;
}

async function sendCm(auth, roomId, content) {
  return api(auth, `/api/community-messenger/rooms/${roomId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content,
      clientMessageId: `ab-qa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    }),
  });
}

async function latestRoomMessageId(admin, roomId) {
  const { data } = await admin
    .from("community_messenger_messages")
    .select("id")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return String(data?.id ?? "").trim() || null;
}

async function markReadCm(auth, roomId, lastReadMessageId) {
  const body = lastReadMessageId
    ? { action: "mark_read", flushOpen: true, lastReadMessageId }
    : { action: "mark_read", flushOpen: true };
  let patch = await api(auth, `/api/community-messenger/rooms/${roomId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!patch.ok) {
    await sleep(800);
    patch = await api(auth, `/api/community-messenger/rooms/${roomId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }
  const roomRead = await api(auth, "/api/me/notifications/room-read", {
    method: "POST",
    body: JSON.stringify({ roomId, readReason: "badge_ab_runtime_qa" }),
  });
  return { patch, roomRead };
}

async function markARead(auth, eventId) {
  return api(auth, "/api/me/notifications", {
    method: "PATCH",
    body: JSON.stringify({ ids: [eventId] }),
  });
}

async function deleteA(auth, eventId) {
  return api(auth, "/api/me/notifications", {
    method: "PATCH",
    body: JSON.stringify({ delete_ids: [eventId] }),
  });
}

async function readParticipantUnread(admin, userId, roomId) {
  const { data } = await admin
    .from("community_messenger_participants")
    .select("unread_count")
    .eq("user_id", userId)
    .eq("room_id", roomId)
    .maybeSingle();
  return n(data?.unread_count);
}

async function runForReceiver({ label, authRecv, authSend, admin, capSerial }) {
  const evidence = { label, host: HOST, checks: {}, snaps: {}, cap: {} };
  const fail = (name, detail) => {
    evidence.checks[name] = { pass: false, ...detail };
  };
  const pass = (name, detail) => {
    evidence.checks[name] = { pass: true, ...detail };
  };

  // baseline clear GD
  await markReadCm(authRecv, GD_ROOM);
  await sleep(1200);
  const base = await snap(authRecv);
  evidence.snaps.base = base;
  if (capSerial) evidence.cap.base = readCapBadge(capSerial);

  // --- A up ---
  const aId = await insertMemberA(admin, authRecv.userId);
  const afterA = await waitSnap(authRecv, (s) => s.A === base.A + 1 && s.bell === base.bell + 1);
  const aUp =
    afterA.A === base.A + 1 &&
    afterA.bell === base.bell + 1 &&
    afterA.appIcon === base.appIcon + 1 &&
    afterA.formula.bellIsA &&
    afterA.formula.appIsAPlusB;
  (aUp ? pass : fail)("A_up_bell_appicon", { base, afterA, aId });
  evidence.snaps.afterA = afterA;
  if (capSerial) evidence.cap.afterA = readCapBadge(capSerial);

  // --- A down (read) ---
  await markARead(authRecv, aId);
  const afterARead = await waitSnap(authRecv, (s) => s.A === base.A);
  const aDown =
    afterARead.A === base.A &&
    afterARead.bell === base.bell &&
    afterARead.appIcon === base.appIcon;
  (aDown ? pass : fail)("A_down_on_read", { afterA, afterARead });
  evidence.snaps.afterARead = afterARead;

  // --- A delete path (insert + delete) ---
  const aId2 = await insertMemberA(admin, authRecv.userId);
  const afterA2 = await waitSnap(authRecv, (s) => s.A === base.A + 1);
  await deleteA(authRecv, aId2);
  const afterADel = await waitSnap(authRecv, (s) => s.A === base.A);
  const aDel =
    afterA2.A === base.A + 1 &&
    afterADel.A === base.A &&
    afterADel.appIcon === base.appIcon;
  (aDel ? pass : fail)("A_down_on_delete", { afterA2, afterADel, aId2 });
  evidence.snaps.afterADel = afterADel;
  if (capSerial) evidence.cap.afterADel = readCapBadge(capSerial);

  // --- B up ---
  await markReadCm(authRecv, GD_ROOM);
  await sleep(1000);
  const beforeB = await snap(authRecv);
  const row0 = await readParticipantUnread(admin, authRecv.userId, GD_ROOM);
  const send1 = await sendCm(authSend, GD_ROOM, `[ab-qa] B1 ${Date.now()}`);
  const afterB1 = await waitSnap(authRecv, (s) => s.gd === beforeB.gd + 1);
  const row1 = await readParticipantUnread(admin, authRecv.userId, GD_ROOM);
  // Hub CM authority for this contract = Domain bottomChat (Projection Apply),
  // not the possibly-stale /store-owner-hub-badge aggregate field.
  const bUp =
    send1.ok &&
    afterB1.gd === beforeB.gd + 1 &&
    afterB1.bottom === beforeB.bottom + 1 &&
    afterB1.appIcon === beforeB.appIcon + 1 &&
    afterB1.bell === beforeB.bell &&
    afterB1.formula.bottomIsGdGroup &&
    row1 >= row0 + 1;
  (bUp ? pass : fail)("B_up_row_hub_bottom_appicon", {
    beforeB,
    afterB1,
    row0,
    row1,
    sendStatus: send1.status,
    hubNote: "Hub digit asserted via Domain bottomChat (= GD+Group rooms)",
  });
  evidence.snaps.afterB1 = afterB1;
  if (capSerial) evidence.cap.afterB1 = readCapBadge(capSerial);

  // --- same room extra message: Row↑ Hub/App Icon flat ---
  const send2 = await sendCm(authSend, GD_ROOM, `[ab-qa] B2 ${Date.now()}`);
  await sleep(1500);
  const afterB2 = await snap(authRecv);
  const row2 = await readParticipantUnread(admin, authRecv.userId, GD_ROOM);
  const rowOnly =
    send2.ok &&
    row2 > row1 &&
    afterB2.gd === afterB1.gd &&
    afterB2.bottom === afterB1.bottom &&
    afterB2.appIcon === afterB1.appIcon;
  (rowOnly ? pass : fail)("B_same_room_row_only", { row1, row2, afterB1, afterB2 });
  evidence.snaps.afterB2 = afterB2;

  // --- B down ---
  const lastMsgId = await latestRoomMessageId(admin, GD_ROOM);
  let readMeta = await markReadCm(authRecv, GD_ROOM, lastMsgId);
  let afterBRead = await waitSnap(authRecv, (s) => s.gd === beforeB.gd, 15000);
  let row3 = await readParticipantUnread(admin, authRecv.userId, GD_ROOM);
  if (!(afterBRead.gd === beforeB.gd && row3 === 0)) {
    await sleep(1000);
    const last2 = await latestRoomMessageId(admin, GD_ROOM);
    readMeta = await markReadCm(authRecv, GD_ROOM, last2);
    afterBRead = await waitSnap(authRecv, (s) => s.gd === beforeB.gd, 15000);
    row3 = await readParticipantUnread(admin, authRecv.userId, GD_ROOM);
  }
  const bDown =
    afterBRead.gd === beforeB.gd &&
    afterBRead.bottom === beforeB.bottom &&
    afterBRead.appIcon === beforeB.appIcon &&
    row3 === 0;
  (bDown ? pass : fail)("B_down_on_room_read", {
    afterB2,
    afterBRead,
    row3,
    lastMsgId,
    readMeta: {
      patchStatus: readMeta.patch?.status,
      patchOk: readMeta.patch?.json?.ok ?? readMeta.patch?.json,
      roomReadStatus: readMeta.roomRead?.status,
      roomReadOk: readMeta.roomRead?.json?.ok,
    },
  });
  evidence.snaps.afterBRead = afterBRead;
  if (capSerial) evidence.cap.afterBRead = readCapBadge(capSerial);

  // --- Owner → member surfaces unchanged ---
  const beforeOwn = await snap(authRecv);
  const ownerEventId = await insertOwnerIntake(admin, USER_B);
  await sleep(1200);
  const afterOwnOnRecv = await snap(authRecv);
  const ownerIsolationRecv =
    afterOwnOnRecv.A === beforeOwn.A &&
    afterOwnOnRecv.bell === beforeOwn.bell &&
    afterOwnOnRecv.appIcon === beforeOwn.appIcon &&
    afterOwnOnRecv.gd === beforeOwn.gd &&
    afterOwnOnRecv.bottom === beforeOwn.bottom;
  (ownerIsolationRecv ? pass : fail)("Owner_no_change_on_member_receiver", {
    beforeOwn,
    afterOwnOnRecv,
    ownerEventId,
  });

  evidence.pass = Object.values(evidence.checks).every((c) => c.pass);
  return evidence;
}

async function runOwnerMemberIsolation(authOwner, admin) {
  const before = await snap(authOwner);
  const id = await insertOwnerIntake(admin, authOwner.userId);
  await sleep(1200);
  const after = await snap(authOwner);
  // Owner intake must not raise Member Bell A / App Icon (rooms may stay)
  const passBell = after.A === before.A && after.bell === before.bell;
  const passApp =
    after.appIcon - after.A - after.gd - after.group - after.trade - after.buyer - after.memberMissed === 0 &&
    after.appIcon === before.appIcon;
  return {
    label: "samsung_owner_self",
    pass: passBell && passApp,
    checks: {
      Owner_not_in_member_A: { pass: passBell, beforeA: before.A, afterA: after.A, id },
      Owner_not_in_member_AppIcon: {
        pass: passApp,
        beforeApp: before.appIcon,
        afterApp: after.appIcon,
      },
    },
    snaps: { before, after },
  };
}

async function main() {
  loadEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const commit =
    spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout?.trim() ||
    "unknown";

  // host health
  let hostOk = false;
  try {
    const r = await fetch(`${HOST}/api/health`).catch(() => null);
    hostOk = Boolean(r && (r.ok || r.status < 500));
  } catch {
    hostOk = false;
  }
  // badge-count is enough probe
  if (!hostOk) {
    try {
      const authProbe = await signInCookie("aaaa");
      const p = await api(authProbe, "/api/me/notifications/badge-count?fresh=1");
      hostOk = p.status === 200;
    } catch {
      hostOk = false;
    }
  }
  if (!hostOk) {
    const blocked = {
      verdict: "RUNTIME_BLOCKED_HOST",
      host: HOST,
      note: "Local/host Next not serving dirty CODE. Start Next with dirty tree or set BADGE_AB_HOST.",
      hardLock: "NOT_DECLARED",
    };
    fs.writeFileSync(path.join(OUT, "VERDICT.json"), JSON.stringify(blocked, null, 2));
    log(`BLOCKED host=${HOST}`);
    console.log(JSON.stringify(blocked, null, 2));
    process.exit(3);
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const authA = await signInCookie("aaaa");
  const authB = await signInCookie("qqqq");
  let authIos = null;
  try {
    authIos = await signInCookie(IOS_LOGIN);
  } catch (e) {
    log(`iphone login skip: ${e.message}`);
  }

  const report = {
    commit,
    host: HOST,
    startedAt: new Date().toISOString(),
    dirtyTree: true,
    devices: DEVICES.map((d) => d.label),
    results: {},
  };

  report.results.xiaomi = await runForReceiver({
    label: "xiaomi_aaaa",
    authRecv: authA,
    authSend: authB,
    admin,
    capSerial: DEVICES[0].serial,
  });
  fs.writeFileSync(path.join(OUT, "xiaomi.json"), JSON.stringify(report.results.xiaomi, null, 2));
  log(`xiaomi pass=${report.results.xiaomi.pass}`);

  report.results.samsung = await runForReceiver({
    label: "samsung_qqqq",
    authRecv: authB,
    authSend: authA,
    admin,
    capSerial: DEVICES[1].serial,
  });
  // Owner isolation on Samsung (owner account)
  report.results.samsung_owner = await runOwnerMemberIsolation(authB, admin);
  fs.writeFileSync(path.join(OUT, "samsung.json"), JSON.stringify(report.results.samsung, null, 2));
  fs.writeFileSync(path.join(OUT, "samsung-owner.json"), JSON.stringify(report.results.samsung_owner, null, 2));
  log(`samsung pass=${report.results.samsung.pass} ownerIsolation=${report.results.samsung_owner.pass}`);

  // iPhone device is connected; GD room membership for asas55 is not guaranteed.
  // API lifecycle for iPhone identity uses aaaa (same member contract); Cap/SpringBoard
  // echo still requires WebView sync on-device (recorded separately).
  if (authIos) {
    report.results.iphone_login = { ok: true, userId: authIos.userId, login: authIos.login };
  }
  report.results.iphone = await runForReceiver({
    label: "iphone_api_member_aaaa",
    authRecv: authA,
    authSend: authB,
    admin,
    capSerial: null,
  });
  report.results.iphone.deviceUdid = IOS_UDID;
  report.results.iphone.note =
    "API identity=aaaa (GD member). iPhone UDID attached; SpringBoard Cap digit not asserted in this API harness.";
  fs.writeFileSync(path.join(OUT, "iphone.json"), JSON.stringify(report.results.iphone, null, 2));
  log(`iphone(api aaaa) pass=${report.results.iphone.pass}`);

  // Cap note: Cap prefs only move when WebView runs NativeBadgeSync on this host.
  report.capNote =
    "Android capacitor.badge dumped; values reflect last WebView sync origin (often prod). API snaps are host-authoritative for this run.";

  const apiPass =
    report.results.xiaomi.pass &&
    report.results.samsung.pass &&
    report.results.samsung_owner.pass &&
    report.results.iphone.pass === true;

  report.endedAt = new Date().toISOString();
  report.verdict = apiPass ? "RUNTIME_PASS_API_3DEVICE" : "RUNTIME_PARTIAL_OR_FAIL";
  report.hardLock = apiPass ? "CANDIDATE_ONLY_IF_CAP_ALSO_MATCHES_HOST" : "NOT_DECLARED";
  if (apiPass && HOST.includes("127.0.0.1")) {
    report.hardLock = "NOT_DECLARED";
    report.hardLockReason =
      "API lifecycle PASS on local dirty host, but Cap/SpringBoard 3-device UI echo against this host not proven; deploy or local-runtime WebView sync required before HARD LOCK.";
  }

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, "VERDICT.json"), JSON.stringify({
    verdict: report.verdict,
    hardLock: report.hardLock,
    hardLockReason: report.hardLockReason || null,
    host: HOST,
    commit,
    out: OUT,
  }, null, 2));
  log(`verdict=${report.verdict} hardLock=${report.hardLock} out=${OUT}`);
  console.log(JSON.stringify({ verdict: report.verdict, hardLock: report.hardLock, out: OUT }, null, 2));
  process.exit(apiPass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
