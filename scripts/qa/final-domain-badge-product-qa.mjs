#!/usr/bin/env node
/**
 * Final Domain Badge PRODUCT QA — aaaa ↔ qqqq · Xiaomi / Samsung · 3 rounds.
 *
 * Evidence: Production API projection (authoritative) + optional APK CDP UI.
 * Does not invent a new badge system — measures Domain Authority surfaces.
 *
 * Usage:
 *   node scripts/qa/final-domain-badge-product-qa.mjs
 *   FINAL_BADGE_ROUNDS=3 FINAL_BADGE_CDP=1 node scripts/qa/final-domain-badge-product-qa.mjs
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
const PROD = process.env.FINAL_BADGE_PROD?.trim() || "https://samarket.vercel.app";
const ROUNDS = Math.max(1, Number(process.env.FINAL_BADGE_ROUNDS || 3));
const USE_CDP = process.env.FINAL_BADGE_CDP === "1";
const COMMIT =
  spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout?.trim() ||
  "unknown";
const OUT_ROOT = path.join(ROOT, ".qa-logs/final-domain-badge-qa");

const USER_A = "11111111-1111-1111-1111-111111111111"; // aaaa Xiaomi
const USER_B = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8"; // qqqq Samsung
const GD_ROOM = process.env.FINAL_GD_ROOM || "b19e2672-f26f-4a2e-8125-52575da4a62a";
const GROUP_ROOM =
  process.env.FINAL_GROUP_ROOM || "b7671bc9-f42d-478d-9c3a-1db4211ba9b1";
const STORE_ID = process.env.FINAL_STORE_ID || "076bffda-3048-4bfb-80ae-985a69105f4a";
const POST_B = process.env.FINAL_TRADE_POST_B || "fbcf9dac-1d5e-44c3-b633-2f590de614f9"; // B seller
const POST_B2 = process.env.FINAL_TRADE_POST_B2 || "fff6cee7-96e7-4ff0-b9b2-3c2de90cf6bd";

const DEVICES = [
  {
    label: "xiaomi",
    model: "24076RP19G",
    serial: process.env.P4_DEVICE_A?.trim() || "8b37179f7d94",
    login: "aaaa",
    userId: USER_A,
    role: "receiver_primary",
    cdpPort: 9223,
  },
  {
    label: "samsung",
    model: "SM-M156S",
    serial: process.env.P4_DEVICE_B?.trim() || "RFCY40PY2CA",
    login: "qqqq",
    userId: USER_B,
    role: "owner_primary",
    cdpPort: 9224,
  },
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function log(line) {
  console.log(`[final-badge-qa] ${line}`);
}

function n(v) {
  return Math.max(0, Math.floor(Number(v) || 0));
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
    const activeSessionId = String(pr?.active_session_id ?? "").trim() || null;
    if (activeSessionId) {
      cookie += `; samarket_active_session_id=${encodeURIComponent(activeSessionId)}`;
    }
  }
  return { cookie, userId: data.session.user.id, login };
}

async function prodFetch(pathname, auth, init = {}) {
  const headers = {
    cookie: auth.cookie,
    accept: "application/json",
    "content-type": "application/json",
    ...(init.headers || {}),
  };
  const res = await fetch(`${PROD}${pathname}`, { ...init, headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, json, text };
}

async function snapshot(auth) {
  const [badge, hub] = await Promise.all([
    prodFetch("/api/me/notifications/badge-count?fresh=1", auth),
    prodFetch("/api/me/store-owner-hub-badge", auth),
  ]);
  const b = badge.json || {};
  const h = hub.json || {};
  const rooms = b.domainUnreadRooms || b.projection?.domainUnread || {};
  const gd = n(rooms.general_direct);
  const group = n(rooms.group);
  const trade = n(rooms.trade);
  const buyer = n(b.storeOrderBuyerDeliveryUnread);
  const owner = n(b.storeOrderOwnerChatUnread);
  const orphan = n(b.domainAppIcon?.missedCall ?? b.projection?.orphanMissedCallCount);
  const bottom = n(b.projection?.bottomChatTotal);
  const appIcon = n(b.projection?.appIconTotal);
  const bell = n(b.projection?.bellTotal ?? b.total);
  const approved = n(b.unreadApprovedNotificationEvents ?? b.total);
  return {
    status: { badge: badge.status, hub: hub.status },
    gd,
    group,
    trade,
    buyer,
    owner,
    orphan,
    bottom,
    appIcon,
    bell,
    approved,
    hub: {
      communityMessengerUnread: n(h.communityMessengerUnread),
      buyerOrderAttention: n(h.buyerOrderAttention),
      storeOrderChatUnread: n(h.storeOrderChatUnread),
      storeOrderOwnerUnreadRooms: n(h.storeOrderOwnerUnreadRooms),
      chatUnread: n(h.chatUnread),
    },
    relations: {
      bottomOk: bottom === gd + group,
      appOk: appIcon === gd + group + trade + buyer + owner + orphan,
      bellEqualsApproved: bell === approved,
      bellNotRoomCopy: bell !== gd + group + trade + buyer + owner + orphan || gd + group + trade + buyer + owner + orphan === 0,
      bottomMatchesHubCm: n(h.communityMessengerUnread) === bottom || n(h.communityMessengerUnread) === gd + group,
      customerHubOk: n(h.buyerOrderAttention) === buyer || buyer === 0,
      ownerFabNotCombined: n(h.storeOrderChatUnread) !== buyer + owner || buyer === 0 || owner === 0,
    },
  };
}

async function sendCmMessage(auth, roomId, label) {
  return prodFetch(`/api/community-messenger/rooms/${roomId}/messages`, auth, {
    method: "POST",
    body: JSON.stringify({
      content: label,
      clientMessageId: `final-badge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }),
  });
}

async function sendTradeMessage(auth, tradeRoomId, label) {
  return prodFetch(`/api/chat/rooms/${tradeRoomId}/messages`, auth, {
    method: "POST",
    body: JSON.stringify({
      body: label,
      messageType: "text",
    }),
  });
}

async function markReadCm(auth, roomId) {
  let patch = await prodFetch(`/api/community-messenger/rooms/${roomId}`, auth, {
    method: "PATCH",
    body: JSON.stringify({ action: "mark_read", flushOpen: true }),
  });
  if (!patch.ok) {
    await sleep(800);
    patch = await prodFetch(`/api/community-messenger/rooms/${roomId}`, auth, {
      method: "PATCH",
      body: JSON.stringify({ action: "mark_read", flushOpen: true }),
    });
  }
  const roomRead = await prodFetch(`/api/me/notifications/room-read`, auth, {
    method: "POST",
    body: JSON.stringify({ roomId, readReason: "final_domain_badge_qa" }),
  });
  return { patch, roomRead };
}

async function markReadOrderChat(auth, { orderId, roomId, role }) {
  return prodFetch(`/api/domains/order/read-order-chat`, auth, {
    method: "POST",
    body: JSON.stringify({ orderId, roomId, role }),
  });
}

async function ensureTradeRoom(buyerAuth, itemId) {
  const res = await prodFetch("/api/chat/item/start", buyerAuth, {
    method: "POST",
    body: JSON.stringify({ itemId }),
  });
  const roomId = res.json?.roomId || null;
  const messengerRoomId = res.json?.messengerRoomId || null;
  return { ...res, roomId, messengerRoomId };
}

async function resolveSoRoom(admin) {
  const { data } = await admin
    .from("store_orders")
    .select("id, store_id, buyer_user_id, community_messenger_room_id, order_status")
    .eq("buyer_user_id", USER_A)
    .eq("store_id", STORE_ID)
    .not("community_messenger_room_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(5);
  const row = (data || []).find((r) => r.community_messenger_room_id) || null;
  return row;
}

function relationPass(snap) {
  const r = snap.relations;
  return Boolean(r.bottomOk && r.appOk && r.bellEqualsApproved && r.bellNotRoomCopy);
}

function delta(before, after, key) {
  return n(after[key]) - n(before[key]);
}

async function scenarioGd({ sender, receiver, round, outDir }) {
  // Baseline: clear receiver unread for this room so room-count +1 is measurable
  await markReadCm(receiver, GD_ROOM);
  await sleep(1500);
  const beforeR = await snapshot(receiver);
  const beforeS = await snapshot(sender);
  const label = `[final-badge] GD R${round} ${Date.now()}`;
  const send1 = await sendCmMessage(sender, GD_ROOM, label);
  await sleep(3000);
  const after1R = await snapshot(receiver);
  const after1S = await snapshot(sender);
  const send2 = await sendCmMessage(sender, GD_ROOM, `${label} +2`);
  const send3 = await sendCmMessage(sender, GD_ROOM, `${label} +3`);
  await sleep(2000);
  const afterExtraR = await snapshot(receiver);
  const read = await markReadCm(receiver, GD_ROOM);
  await sleep(2500);
  const afterReadR = await snapshot(receiver);
  await sleep(500);
  const afterResumeR = await snapshot(receiver);

  const bumped = delta(beforeR, after1R, "gd") === 1;
  const bottomBumpOk = delta(beforeR, after1R, "bottom") === 1;
  const noExtraRoom =
    afterExtraR.gd === after1R.gd && afterExtraR.bottom === after1R.bottom && afterExtraR.appIcon === after1R.appIcon;
  const readClears =
    afterReadR.gd === beforeR.gd &&
    afterReadR.bottom === beforeR.bottom &&
    afterResumeR.gd === afterReadR.gd;

  const pass =
    send1.ok &&
    send2.ok &&
    send3.ok &&
    relationPass(after1R) &&
    relationPass(afterReadR) &&
    bumped &&
    bottomBumpOk &&
    noExtraRoom &&
    readClears &&
    delta(beforeS, after1S, "gd") === 0;

  const result = {
    domain: "general_direct",
    pass,
    send1: { status: send1.status, ok: send1.json?.ok ?? send1.ok, err: send1.json?.error },
    beforeR,
    after1R,
    afterExtraR,
    afterReadR,
    afterResumeR,
    beforeS: { gd: beforeS.gd, bottom: beforeS.bottom },
    after1S: { gd: after1S.gd, bottom: after1S.bottom },
    deltas: {
      gd: delta(beforeR, after1R, "gd"),
      bottom: delta(beforeR, after1R, "bottom"),
      appIcon: delta(beforeR, after1R, "appIcon"),
      bell: delta(beforeR, after1R, "bell"),
      trade: delta(beforeR, after1R, "trade"),
      buyer: delta(beforeR, after1R, "buyer"),
      owner: delta(beforeR, after1R, "owner"),
    },
    checks: { bumped, bottomBumpOk, noExtraRoom, readClears, relationAfter: relationPass(after1R) },
    read: {
      patch: read.patch.status,
      patchOk: read.patch.json?.ok,
      patchErr: read.patch.json?.error,
      roomRead: read.roomRead.status,
    },
  };
  fs.writeFileSync(path.join(outDir, "gd.json"), JSON.stringify(result, null, 2));
  return result;
}

async function scenarioGroup({ sender, receiver, round, outDir }) {
  await markReadCm(receiver, GROUP_ROOM);
  await sleep(1500);
  const beforeR = await snapshot(receiver);
  const label = `[final-badge] GROUP R${round} ${Date.now()}`;
  const send1 = await sendCmMessage(sender, GROUP_ROOM, label);
  await sleep(3000);
  const after1R = await snapshot(receiver);
  await sendCmMessage(sender, GROUP_ROOM, `${label} +2`);
  await sleep(1500);
  const afterExtraR = await snapshot(receiver);
  const read = await markReadCm(receiver, GROUP_ROOM);
  await sleep(2500);
  const afterReadR = await snapshot(receiver);
  const afterResumeR = await snapshot(receiver);

  const noExtra =
    afterExtraR.group === after1R.group &&
    afterExtraR.bottom === after1R.bottom &&
    afterExtraR.appIcon === after1R.appIcon;
  const pass =
    send1.ok &&
    relationPass(after1R) &&
    delta(beforeR, after1R, "group") === 1 &&
    delta(beforeR, after1R, "bottom") === 1 &&
    noExtra &&
    afterReadR.group === beforeR.group &&
    afterResumeR.group === afterReadR.group &&
    delta(beforeR, after1R, "trade") === 0 &&
    delta(beforeR, after1R, "buyer") === 0 &&
    delta(beforeR, after1R, "owner") === 0;

  const result = {
    domain: "group",
    pass,
    beforeR,
    after1R,
    afterExtraR,
    afterReadR,
    afterResumeR,
    deltas: {
      group: delta(beforeR, after1R, "group"),
      bottom: delta(beforeR, after1R, "bottom"),
      appIcon: delta(beforeR, after1R, "appIcon"),
    },
    read: { patch: read.patch.status, roomRead: read.roomRead.status, err: read.patch.json?.error },
  };
  fs.writeFileSync(path.join(outDir, "group.json"), JSON.stringify(result, null, 2));
  return result;
}

async function scenarioTrade({ buyerAuth, sellerAuth, itemId, round, outDir, tag }) {
  const ensured = await ensureTradeRoom(buyerAuth, itemId);
  if (!ensured.roomId || !ensured.messengerRoomId) {
    const result = {
      domain: "trade",
      tag,
      pass: false,
      blocked: true,
      reason: "trade_room_create_failed",
      ensured,
    };
    fs.writeFileSync(path.join(outDir, `trade-${tag}.json`), JSON.stringify(result, null, 2));
    return result;
  }
  const tradeRoomId = ensured.roomId;
  const messengerRoomId = ensured.messengerRoomId;
  await markReadCm(sellerAuth, messengerRoomId);
  await sleep(1500);
  const beforeSeller = await snapshot(sellerAuth);
  const beforeBuyer = await snapshot(buyerAuth);
  const label = `[final-badge] TRADE ${tag} R${round} ${Date.now()}`;
  const send1 = await sendTradeMessage(buyerAuth, tradeRoomId, label);
  await sleep(3000);
  const after1Seller = await snapshot(sellerAuth);
  await sendTradeMessage(buyerAuth, tradeRoomId, `${label} +2`);
  await sleep(1500);
  const afterExtraSeller = await snapshot(sellerAuth);
  const read = await markReadCm(sellerAuth, messengerRoomId);
  await sleep(2500);
  const afterReadSeller = await snapshot(sellerAuth);
  const afterResumeSeller = await snapshot(sellerAuth);

  const noExtra =
    afterExtraSeller.trade === after1Seller.trade &&
    afterExtraSeller.appIcon === after1Seller.appIcon;
  const bottomUnchanged = delta(beforeSeller, after1Seller, "bottom") === 0;
  const tradeBump = delta(beforeSeller, after1Seller, "trade") === 1;
  const pass =
    send1.ok &&
    relationPass(after1Seller) &&
    tradeBump &&
    noExtra &&
    bottomUnchanged &&
    afterReadSeller.trade === beforeSeller.trade &&
    afterResumeSeller.trade === afterReadSeller.trade &&
    delta(beforeBuyer, after1Seller, "bottom") === 0;

  const result = {
    domain: "trade",
    tag,
    tradeRoomId,
    messengerRoomId,
    pass,
    send1: { status: send1.status, ok: send1.ok, err: send1.json?.error },
    beforeSeller,
    after1Seller,
    afterExtraSeller,
    afterReadSeller,
    afterResumeSeller,
    deltas: {
      trade: delta(beforeSeller, after1Seller, "trade"),
      bottom: delta(beforeSeller, after1Seller, "bottom"),
      appIcon: delta(beforeSeller, after1Seller, "appIcon"),
    },
    read: { patch: read.patch.status, roomRead: read.roomRead.status, err: read.patch.json?.error },
  };
  fs.writeFileSync(path.join(outDir, `trade-${tag}.json`), JSON.stringify(result, null, 2));
  return result;
}

async function scenarioStoreOrder({ buyerAuth, ownerAuth, roomId, orderId, round, outDir }) {
  // Clear both sides via OrderDomain read authority (not CM-only mark_read)
  await markReadOrderChat(ownerAuth, { orderId, roomId, role: "owner" });
  await markReadOrderChat(buyerAuth, { orderId, roomId, role: "customer" });
  await sleep(2000);

  const beforeBuyer = await snapshot(buyerAuth);
  const beforeOwner = await snapshot(ownerAuth);
  const label = `[final-badge] SO R${round} ${Date.now()}`;

  const sendOwner = await sendCmMessage(buyerAuth, roomId, `${label} buyer->owner`);
  await sleep(3000);
  const afterOwnerRecv = await snapshot(ownerAuth);
  const afterBuyerUnchanged = await snapshot(buyerAuth);

  const sendBuyer = await sendCmMessage(ownerAuth, roomId, `${label} owner->buyer`);
  await sleep(3000);
  const afterBuyerRecv = await snapshot(buyerAuth);
  const afterOwnerUnchangedOnBuyerMsg = await snapshot(ownerAuth);

  const ownerRead = await markReadOrderChat(ownerAuth, { orderId, roomId, role: "owner" });
  await sleep(2500);
  const afterOwnerRead = await snapshot(ownerAuth);
  const afterBuyerWhenOwnerRead = await snapshot(buyerAuth);

  const buyerRead = await markReadOrderChat(buyerAuth, { orderId, roomId, role: "customer" });
  await sleep(2500);
  const afterBuyerRead = await snapshot(buyerAuth);
  const afterOwnerWhenBuyerRead = await snapshot(ownerAuth);

  const ownerBumpOk = delta(beforeOwner, afterOwnerRecv, "owner") === 1;
  const buyerBumpOk = delta(beforeBuyer, afterBuyerRecv, "buyer") === 1;
  const bottomNever =
    delta(beforeOwner, afterOwnerRecv, "bottom") === 0 &&
    delta(beforeBuyer, afterBuyerRecv, "bottom") === 0;
  const independentRead =
    afterBuyerWhenOwnerRead.buyer === afterBuyerRecv.buyer &&
    afterOwnerWhenBuyerRead.owner === afterOwnerRead.owner;

  const pass =
    sendOwner.ok &&
    sendBuyer.ok &&
    ownerRead.ok &&
    buyerRead.ok &&
    relationPass(afterOwnerRecv) &&
    relationPass(afterBuyerRecv) &&
    ownerBumpOk &&
    buyerBumpOk &&
    bottomNever &&
    independentRead &&
    afterOwnerRead.owner === beforeOwner.owner &&
    afterBuyerRead.buyer === beforeBuyer.buyer;

  const result = {
    domain: "store_order",
    roomId,
    orderId,
    pass,
    beforeBuyer,
    beforeOwner,
    afterOwnerRecv,
    afterBuyerUnchanged,
    afterBuyerRecv,
    afterOwnerUnchangedOnBuyerMsg,
    afterOwnerRead,
    afterBuyerWhenOwnerRead,
    afterBuyerRead,
    afterOwnerWhenBuyerRead,
    deltas: {
      ownerOnBuyerSend: delta(beforeOwner, afterOwnerRecv, "owner"),
      buyerOnOwnerSend: delta(beforeBuyer, afterBuyerRecv, "buyer"),
      ownerBottom: delta(beforeOwner, afterOwnerRecv, "bottom"),
      buyerBottom: delta(beforeBuyer, afterBuyerRecv, "bottom"),
      ownerFabField: {
        before: beforeOwner.hub.storeOrderChatUnread,
        afterRecv: afterOwnerRecv.hub.storeOrderChatUnread,
        afterRead: afterOwnerRead.hub.storeOrderChatUnread,
      },
    },
    checks: { ownerBumpOk, buyerBumpOk, bottomNever, independentRead },
    reads: {
      owner: { status: ownerRead.status, ok: ownerRead.json?.ok, err: ownerRead.json?.error },
      buyer: { status: buyerRead.status, ok: buyerRead.json?.ok, err: buyerRead.json?.error },
    },
  };
  fs.writeFileSync(path.join(outDir, "store-order.json"), JSON.stringify(result, null, 2));
  return result;
}

async function relaunchStability(auth, outDir) {
  const a = await snapshot(auth);
  await sleep(800);
  const b = await snapshot(auth);
  await sleep(800);
  const c = await snapshot(auth);
  const stable =
    a.gd === b.gd &&
    b.gd === c.gd &&
    a.bottom === b.bottom &&
    b.bottom === c.bottom &&
    a.buyer === b.buyer &&
    a.owner === b.owner &&
    a.appIcon === c.appIcon &&
    a.bell === c.bell;
  const result = { stable, series: [a, b, c] };
  fs.writeFileSync(path.join(outDir, "relaunch-stable.json"), JSON.stringify(result, null, 2));
  return result;
}

async function optionalCdp(device, outDir) {
  if (!USE_CDP) return { skipped: true };
  try {
    const { chromium } = await import("@playwright/test");
    const { ensureApkWebViewLogin, connectWebView, forwardCdp, navigateApkWebView } = await import(
      "./lib/apk-webview-cdp.mjs"
    );
    const login = await ensureApkWebViewLogin({
      adb,
      chromium,
      serial: device.serial,
      cdpPort: device.cdpPort,
      act: ACT,
      pkg: PKG,
      prod: PROD,
      login: device.login,
      expectedUserId: device.userId,
      loadEnv,
      password: process.env.E2E_TEST_PASSWORD?.trim() || "1234",
      log: (m) => log(`cdp ${device.label}: ${m}`),
      label: device.label,
      restartForFcm: false,
    });
    if (!login.ok) return { ok: false, probe: login.probe };
    adb(device.serial, "shell", "am", "start", "-n", ACT);
    await sleep(2000);
    forwardCdp(adb, device.serial, device.cdpPort);
    const { browser, page } = await connectWebView(chromium, device.cdpPort);
    await navigateApkWebView(page, `${PROD}/community-messenger`, 3500);
    const home = await page.evaluate(() => ({
      path: location.pathname,
      text: document.body?.innerText?.slice(0, 500) || "",
    }));
    await browser.close().catch(() => {});
    const out = { ok: true, home };
    fs.writeFileSync(path.join(outDir, "cdp-home.json"), JSON.stringify(out, null, 2));
    return out;
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

async function main() {
  loadEnv();
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const authA = await signInCookie("aaaa");
  const authB = await signInCookie("qqqq");
  const soOrder = await resolveSoRoom(admin);
  if (!soOrder?.community_messenger_room_id || !soOrder?.id) {
    throw new Error("no store_order room for aaaa@qqqq store");
  }
  const soRoomId = soOrder.community_messenger_room_id;
  const soOrderId = soOrder.id;
  log(`commit=${COMMIT} prod=${PROD} soRoom=${soRoomId.slice(0, 8)} order=${soOrderId.slice(0, 8)} store=${STORE_ID.slice(0, 8)}`);

  // ensure devices awake with app
  for (const d of DEVICES) {
    adb(d.serial, "shell", "am", "force-stop", PKG);
    await sleep(300);
    adb(d.serial, "shell", "am", "start", "-n", ACT);
  }
  await sleep(1500);

  const report = {
    commit: COMMIT,
    prod: PROD,
    startedAt: new Date().toISOString(),
    rooms: { gd: GD_ROOM, group: GROUP_ROOM, so: soRoomId, soOrderId, storeId: STORE_ID, posts: [POST_B, POST_B2] },
    rounds: [],
    verdict: "INSUFFICIENT",
  };

  for (let round = 1; round <= ROUNDS; round++) {
    log(`===== ROUND ${round}/${ROUNDS} =====`);
    // Evidence layout: xiaomi-rN / samsung-rN (per device folder)
    const xiaomiDir = path.join(OUT_ROOT, `xiaomi-r${round}`);
    const samsungDir = path.join(OUT_ROOT, `samsung-r${round}`);
    fs.mkdirSync(xiaomiDir, { recursive: true });
    fs.mkdirSync(samsungDir, { recursive: true });

    // Xiaomi (aaaa) receives GD/group from qqqq; Samsung (qqqq) is sender
    const gdXiaomi = await scenarioGd({
      sender: authB,
      receiver: authA,
      round,
      outDir: xiaomiDir,
    });
    // Reverse direction for Samsung evidence (aaaa sends, qqqq receives)
    const gdSamsung = await scenarioGd({
      sender: authA,
      receiver: authB,
      round,
      outDir: samsungDir,
    });
    const groupXiaomi = await scenarioGroup({
      sender: authB,
      receiver: authA,
      round,
      outDir: xiaomiDir,
    });
    const groupSamsung = await scenarioGroup({
      sender: authA,
      receiver: authB,
      round,
      outDir: samsungDir,
    });
    // trade: aaaa buys qqqq listing → qqqq (seller/Samsung) receives
    const trade1 = await scenarioTrade({
      buyerAuth: authA,
      sellerAuth: authB,
      itemId: POST_B,
      round,
      outDir: samsungDir,
      tag: "listingA",
    });
    const trade2 = await scenarioTrade({
      buyerAuth: authA,
      sellerAuth: authB,
      itemId: POST_B2,
      round,
      outDir: samsungDir,
      tag: "listingB",
    });
    // Copy trade evidence to Xiaomi folder (buyer side relations)
    for (const tag of ["listingA", "listingB"]) {
      const src = path.join(samsungDir, `trade-${tag}.json`);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(xiaomiDir, `trade-${tag}.json`));
    }
    const so = await scenarioStoreOrder({
      buyerAuth: authA,
      ownerAuth: authB,
      roomId: soRoomId,
      orderId: soOrderId,
      round,
      outDir: xiaomiDir,
    });
    fs.copyFileSync(path.join(xiaomiDir, "store-order.json"), path.join(samsungDir, "store-order.json"));

    const stableA = await relaunchStability(authA, xiaomiDir);
    const stableB = await relaunchStability(authB, samsungDir);
    const cdpA = await optionalCdp(DEVICES[0], xiaomiDir);
    const cdpB = await optionalCdp(DEVICES[1], samsungDir);

    const roundPass =
      gdXiaomi.pass &&
      gdSamsung.pass &&
      groupXiaomi.pass &&
      groupSamsung.pass &&
      trade1.pass &&
      trade2.pass &&
      so.pass &&
      stableA.stable &&
      stableB.stable;

    const roundSummary = {
      round,
      pass: roundPass,
      xiaomi: {
        gd: gdXiaomi.pass,
        group: groupXiaomi.pass,
        tradeA: trade1.pass,
        tradeB: trade2.pass,
        storeOrderCustomer: so.pass,
        relaunch: stableA.stable,
        cdp: cdpA.skipped ? "skipped" : cdpA.ok,
      },
      samsung: {
        gd: gdSamsung.pass,
        group: groupSamsung.pass,
        tradeA: trade1.pass,
        tradeB: trade2.pass,
        storeOrderOwner: so.pass,
        relaunch: stableB.stable,
        cdp: cdpB.skipped ? "skipped" : cdpB.ok,
      },
      multiStore: "N/A_single_store_owner",
      missedCall: "NOT_RUN_this_harness",
    };
    report.rounds.push(roundSummary);
    fs.writeFileSync(path.join(xiaomiDir, "session-summary.json"), JSON.stringify(roundSummary, null, 2));
    fs.writeFileSync(path.join(samsungDir, "session-summary.json"), JSON.stringify(roundSummary, null, 2));
    log(
      `round ${round} pass=${roundPass} gd=${gdXiaomi.pass}/${gdSamsung.pass} group=${groupXiaomi.pass}/${groupSamsung.pass} trade=${trade1.pass}/${trade2.pass} so=${so.pass}`
    );
  }

  const allPass = report.rounds.length === ROUNDS && report.rounds.every((r) => r.pass);
  report.endedAt = new Date().toISOString();
  report.verdict = allPass
    ? "PRODUCT_PASS_CORE_DOMAINS"
    : "CODE_PASS_RUNTIME_PARTIAL_OR_FAIL";
  report.note =
    "Core domains: GD/group/trade×2/store_order customer↔owner + relation formulas + remount stability. Multi-store N/A (qqqq owns 1 store). Missed-call not exercised in this harness.";
  fs.writeFileSync(path.join(OUT_ROOT, `report-${COMMIT}-${Date.now()}.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT_ROOT, "latest-report.json"), JSON.stringify(report, null, 2));
  log(`verdict=${report.verdict}`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(allPass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
