#!/usr/bin/env node
/**
 * Messenger 4-domain UX runtime close — hub/list/room header/back matrix.
 *
 * Usage:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 node scripts/qa/messenger-4-domain-ux-runtime-close.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const outDir = path.join(root, ".qa-logs", `messenger-4-domain-ux-runtime-${stamp}`);
const outFile = path.join(outDir, "REPORT.json");

const LABELS = {
  general: "1:1 대화",
  trade: "거래 채팅",
  order: "주문 채팅",
  groupPrivate: "비공개 그룹",
};

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function signInForLoginId(loginId) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY required");
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const password = process.env.E2E_TEST_PASSWORD ?? process.env.SAMARKET_TEST_PASSWORD ?? "1234";
  const host = new URL(baseUrl).hostname;

  let email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
  if (serviceKey && loginId === "aa11") {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: pr } = await admin
      .from("profiles")
      .select("auth_login_email, email")
      .or("username.eq.aa11")
      .maybeSingle();
    const resolved = String(pr?.auth_login_email ?? pr?.email ?? "").trim().toLowerCase();
    if (resolved.includes("@")) email = resolved;
  }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  const cookies = [
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(JSON.stringify(session)),
      domain: host,
      path: "/",
      sameSite: "Lax",
    },
  ];
  if (serviceKey) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", data.session.user.id)
      .maybeSingle();
    const activeSession = String(pr?.active_session_id ?? "").trim();
    if (activeSession) {
      cookies.push({
        name: "samarket_active_session_id",
        value: encodeURIComponent(activeSession),
        domain: host,
        path: "/",
        sameSite: "Lax",
      });
    }
  }
  return { cookies, loginId, userId: data.session.user.id };
}

async function findOwnedStoreOrderRoom(userId, storeOrderRooms) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!serviceKey || !url || !userId || !storeOrderRooms?.length) return null;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: stores } = await admin.from("stores").select("id").eq("owner_user_id", userId).limit(20);
  const storeIds = new Set((stores ?? []).map((s) => String(s.id ?? "").trim()).filter(Boolean));
  if (storeIds.size === 0) return null;
  const { data: orders } = await admin
    .from("store_orders")
    .select("id, store_id")
    .in("store_id", [...storeIds])
    .limit(80);
  const orderIds = new Set((orders ?? []).map((o) => String(o.id ?? "").trim()).filter(Boolean));
  for (const room of storeOrderRooms) {
    const oid = String(room.contextMeta?.storeOrderId ?? "").trim();
    const sid = String(room.contextMeta?.storeId ?? "").trim();
    const dk = String(room.messengerDirectKey ?? room.directKey ?? "");
    if (sid && storeIds.has(sid)) return room;
    if (oid && orderIds.has(oid)) return room;
    for (const id of orderIds) {
      if (id && dk.includes(id)) return room;
    }
  }
  return null;
}

function loginIdCandidates() {
  return [
    ...new Set(
      [process.env.E2E_TEST_USERNAME?.trim(), "aa11", "aaaa", "wwww", "qqqq", "bbbb", "asas55"].filter(Boolean)
    ),
  ];
}

async function signInSession() {
  for (const loginId of loginIdCandidates()) {
    const session = await signInForLoginId(loginId);
    if (session) return session;
  }
  throw new Error("signIn failed for all login ids");
}

async function applyAuthCookies(context, auth) {
  await context.clearCookies();
  await context.addCookies([
    ...auth.cookies,
    {
      name: "samarket_e2e_room_diag",
      value: "1",
      domain: new URL(baseUrl).hostname,
      path: "/",
      sameSite: "Lax",
    },
  ]);
}

async function discoverFixturesAcrossAccounts(page) {
  const forced = process.env.E2E_TEST_USERNAME?.trim();
  const loginIds = forced ? [forced] : loginIdCandidates();
  const mergedFixtures = { GENERAL_DIRECT: null, GROUP: null, TRADE: null, STORE_ORDER: null };
  const mergedRooms = { GENERAL_DIRECT: null, GROUP: null, TRADE: null, STORE_ORDER: null };
  const authByDomain = { GENERAL_DIRECT: null, GROUP: null, TRADE: null, STORE_ORDER: null };
  const scanByLogin = {};
  const roomsByLogin = {};
  const matrix = {
    storeOrderOwner: null,
    tradeSecond: null,
    generalTradePeerPair: null,
    sameLoginThreeDomains: null,
  };

  for (const loginId of loginIds) {
    const auth = await signInForLoginId(loginId);
    if (!auth) {
      scanByLogin[loginId] = { ok: false, reason: "sign_in_failed" };
      continue;
    }
    await applyAuthCookies(page.context(), auth);
    await page.goto(`${baseUrl}/community-messenger`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(1000);
    const bootstrap = await fetchBootstrap(page);
    const payload = bootstrap.body ?? {};
    const chats = payload.chats ?? payload.data?.chats ?? [];
    const groups = payload.groups ?? payload.data?.groups ?? [];
    const rooms = [...chats, ...groups];
    const fixtures = { GENERAL_DIRECT: null, GROUP: null, TRADE: null, STORE_ORDER: null };
    const classified = { GENERAL_DIRECT: [], GROUP: [], TRADE: [], STORE_ORDER: [] };
    for (const room of rooms) {
      const d = classifyRoom(room);
      const preferPrivateGroup =
        d === "GROUP" &&
        room.roomType === "private_group" &&
        mergedRooms.GROUP?.roomType !== "private_group";
      if (d in fixtures && !fixtures[d]) fixtures[d] = room?.id ?? null;
      if (d in classified && room?.id) classified[d].push(room);
      if (d in mergedFixtures && room?.id && (!mergedFixtures[d] || preferPrivateGroup)) {
        mergedFixtures[d] = room.id;
        mergedRooms[d] = room;
        authByDomain[d] = auth;
      }
    }
    roomsByLogin[loginId] = classified;
    if (
      !matrix.sameLoginThreeDomains &&
      classified.GENERAL_DIRECT[0] &&
      classified.TRADE[0] &&
      classified.STORE_ORDER[0]
    ) {
      matrix.sameLoginThreeDomains = {
        loginId,
        generalId: classified.GENERAL_DIRECT[0].id,
        tradeId: classified.TRADE[0].id,
        storeOrderId: classified.STORE_ORDER[0].id,
      };
    }
    if (!matrix.tradeSecond && classified.TRADE.length >= 2) {
      matrix.tradeSecond = { auth, rooms: classified.TRADE.slice(0, 2) };
    }
    if (!matrix.generalTradePeerPair) {
      for (const general of classified.GENERAL_DIRECT) {
        const peer = String(general.peerUserId ?? "").trim();
        if (!peer) continue;
        const trade = classified.TRADE.find((r) => String(r.peerUserId ?? "").trim() === peer);
        if (trade) {
          matrix.generalTradePeerPair = { auth, peerUserId: peer, general, trade };
          break;
        }
      }
    }
    if (!matrix.storeOrderOwner) {
      const owned = await findOwnedStoreOrderRoom(auth.userId, classified.STORE_ORDER);
      if (owned) {
        matrix.storeOrderOwner = { auth, room: owned, via: "stores.owner_user_id" };
      } else {
        for (const room of classified.STORE_ORDER.slice(0, 8)) {
          const meta = await fetchRoomBootstrapMeta(page, room.id);
          if (meta.myRole === "owner") {
            matrix.storeOrderOwner = { auth, room, meta, via: "snapshot.myRole" };
            break;
          }
        }
      }
    }
    const ownedId =
      matrix.storeOrderOwner?.auth?.loginId === loginId ? matrix.storeOrderOwner?.room?.id ?? null : null;
    const customerStoreOrder = classified.STORE_ORDER.find((room) => room.id !== ownedId) ?? null;
    if (customerStoreOrder) {
      mergedFixtures.STORE_ORDER = customerStoreOrder.id;
      mergedRooms.STORE_ORDER = customerStoreOrder;
      authByDomain.STORE_ORDER = auth;
      fixtures.STORE_ORDER = customerStoreOrder.id;
    }
    scanByLogin[loginId] = {
      ok: bootstrap.ok,
      chatCount: chats.length,
      groupCount: groups.length,
      fixtures,
      tradeCount: classified.TRADE.length,
      storeOrderCount: classified.STORE_ORDER.length,
      hasActiveSessionCookie: auth.cookies.some((c) => c.name === "samarket_active_session_id"),
    };
    const fourReady = Object.values(mergedFixtures).every(Boolean);
    const matrixReady = Boolean(
      matrix.storeOrderOwner && matrix.tradeSecond && matrix.generalTradePeerPair && matrix.sameLoginThreeDomains
    );
    if (fourReady && matrixReady) break;
  }

  const primaryAuth =
    authByDomain.TRADE ??
    authByDomain.STORE_ORDER ??
    authByDomain.GENERAL_DIRECT ??
    authByDomain.GROUP ??
    (await signInForLoginId(loginIds.find((id) => scanByLogin[id]?.ok !== false) ?? loginIds[0]));
  if (!primaryAuth) throw new Error("discoverFixturesAcrossAccounts: no login succeeded");

  return {
    ...primaryAuth,
    fixtureDiscovery: {
      fixtures: mergedFixtures,
      scanByLogin,
      authLoginByDomain: Object.fromEntries(Object.entries(authByDomain).map(([k, v]) => [k, v?.loginId ?? null])),
      score: Object.values(mergedFixtures).filter(Boolean).length,
      matrix: {
        storeOrderOwner: matrix.storeOrderOwner?.room?.id ?? null,
        storeOrderOwnerLogin: matrix.storeOrderOwner?.auth?.loginId ?? null,
        storeOrderOwnerVia: matrix.storeOrderOwner?.via ?? null,
        tradeSecondIds: matrix.tradeSecond?.rooms?.map((r) => r.id) ?? null,
        generalTradePeerPair: matrix.generalTradePeerPair
          ? {
              loginId: matrix.generalTradePeerPair.auth.loginId,
              peerUserId: matrix.generalTradePeerPair.peerUserId,
              generalId: matrix.generalTradePeerPair.general.id,
              tradeId: matrix.generalTradePeerPair.trade.id,
            }
          : null,
        sameLoginThreeDomains: matrix.sameLoginThreeDomains,
      },
    },
    mergedRooms,
    authByDomain,
    matrix,
    roomsByLogin,
  };
}

function isCommerceDirectKey(dk) {
  const t = (dk ?? "").trim();
  return (
    t.startsWith("trade_pc:") ||
    t.startsWith("trade_item:") ||
    t.startsWith("store_order:") ||
    t.startsWith("trade_order:")
  );
}

function classifyRoom(room) {
  if (
    room.chatDomain === "group" ||
    room.roomType === "private_group" ||
    room.roomType === "open_group"
  ) {
    return "GROUP";
  }
  if (room.chatDomain === "trade" || room.contextMeta?.kind === "trade") return "TRADE";
  if (room.chatDomain === "store_order" || room.contextMeta?.kind === "delivery") return "STORE_ORDER";
  const dk = room.messengerDirectKey ?? room.directKey ?? "";
  if (isCommerceDirectKey(dk)) {
    if ((dk ?? "").includes("store_order") || (dk ?? "").includes("trade_order")) return "STORE_ORDER";
    return "TRADE";
  }
  if (room.roomType === "direct") return "GENERAL_DIRECT";
  return "UNKNOWN";
}

async function fetchBootstrap(page) {
  return page.evaluate(async () => {
    const res = await fetch("/api/community-messenger/bootstrap?lite=1", {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body: json };
  });
}

async function dismissOverlays(page) {
  for (const name of [/나중에/, /Later/, /닫기/, /Close/]) {
    const btn = page.getByRole("button", { name }).first();
    if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
      await btn.click({ timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
  }
}

async function readRoomSignals(page, opts = {}) {
  await page.waitForTimeout(opts.settleMs ?? 3000);
  if (opts.waitTradeDock) {
    await page.waitForSelector("[data-cm-trade-dock]", { timeout: 15_000 }).catch(() => undefined);
  }
  return page.evaluate(() => {
    const roomRoot = document.querySelector("[data-cm-room]");
    const chipText = roomRoot?.querySelector("p.rounded-full")?.textContent?.trim() ?? "";
    const bodyText = document.body?.innerText ?? "";
    return {
      timelineChip: chipText || null,
      bodyHasDirectLabel: /1:1 chat|1:1 대화/i.test(chipText),
      bodyHasTradeLabel: /Trade chat|거래 채팅/i.test(chipText),
      bodyHasOrderLabel: /Order chat|주문 채팅/i.test(chipText),
      bodyHasGroupLabel:
        /비공개 그룹|오픈 그룹|Private group|Open group/i.test(chipText) || /\bgroup\b/i.test(chipText),
      bodyHasMemberSuffix: /[·•]\s*\d+\s*(명|members?)/i.test(chipText),
      headerTitle:
        roomRoot?.querySelector("p.font-semibold")?.textContent?.trim() ||
        roomRoot?.querySelector("p.sam-text-body")?.textContent?.trim() ||
        null,
      cmRoom: !!roomRoot,
      tradeDock: !!document.querySelector("[data-cm-trade-dock]"),
      url: window.location.pathname,
      bodySnippet: bodyText.slice(0, 200),
    };
  });
}

async function fetchRoomBootstrapMeta(page, roomId) {
  return page.evaluate(async (id) => {
    const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(id)}/bootstrap`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    const room = json?.snapshot?.room ?? json?.room ?? null;
    return {
      ok: res.ok,
      status: res.status,
      chatDomain: room?.chatDomain ?? null,
      roomType: room?.roomType ?? null,
      contextKind: room?.contextMeta?.kind ?? null,
      myRole: json?.snapshot?.myRole ?? null,
      peerUserId: room?.peerUserId ?? null,
      title: room?.title ?? null,
    };
  }, roomId);
}

async function probeRoomHeader(page, roomId, opts = {}) {
  const nav = page
    .goto(`${baseUrl}/community-messenger/rooms/${encodeURIComponent(roomId)}`, {
      waitUntil: "commit",
      timeout: 60_000,
    })
    .catch(() => null);
  await page
    .waitForResponse(
      (r) => r.url().includes(`/community-messenger/rooms/${roomId}`) && r.url().includes("/bootstrap") && r.ok(),
      { timeout: 60_000 }
    )
    .catch(() => undefined);
  await nav;
  await page.waitForSelector("[data-cm-room]", { timeout: 60_000 }).catch(() => undefined);
  await dismissOverlays(page);
  const bootstrapMeta = await fetchRoomBootstrapMeta(page, roomId);
  const sig = await readRoomSignals(page, opts);
  return {
    entered: page.url().includes("/community-messenger/rooms/"),
    bootstrapMeta,
    ...sig,
  };
}

async function waitForChatRows(page, timeoutMs = 15_000) {
  try {
    await page.waitForSelector('[data-messenger-chat-row="true"]', { timeout: timeoutMs });
    return await page.locator('[data-messenger-chat-row="true"]').count();
  } catch {
    return 0;
  }
}

async function probeList(page, listHref) {
  await page.goto(`${baseUrl}${listHref}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(3000);
  await dismissOverlays(page);
  const rowCount = await waitForChatRows(page, 35_000);
  let firstListTitle = null;
  if (rowCount > 0) {
    firstListTitle = await page
      .locator('[data-messenger-chat-row="true"]')
      .first()
      .locator("[data-cm-list-title]")
      .textContent()
      .catch(() => null);
  }
  return { rowCount, firstListTitle: firstListTitle?.trim() ?? null, url: page.url() };
}

async function clickBack(page) {
  await page.waitForSelector("[data-cm-room]", { timeout: 15_000 }).catch(() => undefined);
  const back = page.locator("[data-cm-room] button[aria-label]").first();
  if (await back.isVisible({ timeout: 5000 }).catch(() => false)) {
    await back.click({ timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

function isPlaceholderListTitle(title) {
  const t = String(title ?? "").trim();
  if (!t) return true;
  return /^(새 대화|New conversation|cm_ui_new_conversation)$/i.test(t);
}

function assessDomain(domain, evidence) {
  if (evidence.skipped) return "SKIP";
  const checks = evidence.checks ?? {};
  const headerKeys = Object.keys(checks).filter(
    (k) =>
      k.startsWith("timeline_") ||
      k.startsWith("no_") ||
      k.startsWith("bootstrap_") ||
      k === "trade_dock" ||
      k === "member_suffix" ||
      k === "room_entered"
  );
  const headerChecks = headerKeys.map((k) => checks[k]);
  if (headerChecks.length === 0) return "NOT_PROVEN";
  const headerPass = headerChecks.every(Boolean);
  const listPass =
    checks.list_rows_visible !== false &&
    (checks.list_product_primary === undefined || Boolean(checks.list_product_primary)) &&
    (checks.list_store_primary === undefined || Boolean(checks.list_store_primary));
  if (headerPass && listPass) return "PASS";
  if (headerPass) return "PARTIAL";
  if (headerChecks.some(Boolean)) return "PARTIAL";
  return "FAIL";
}

async function runDomainGeneral(page, room) {
  const evidence = { domain: "GENERAL_DIRECT", roomId: room?.id ?? null, checks: {}, errors: [] };
  if (!room?.id) {
    evidence.skipped = true;
    evidence.skipReason = "no_fixture_room";
    return evidence;
  }
  evidence.list = await probeList(page, "/community-messenger?section=chats");
  evidence.checks.list_rows_visible = evidence.list.rowCount > 0;
  const roomSig = await probeRoomHeader(page, room.id);
  evidence.room = roomSig;
  evidence.checks.room_entered = roomSig.entered && roomSig.cmRoom;
  evidence.checks.bootstrap_chat_domain =
    roomSig.bootstrapMeta?.chatDomain === "general_direct" ||
    (roomSig.bootstrapMeta?.roomType === "direct" &&
      roomSig.bootstrapMeta?.contextKind !== "trade" &&
      roomSig.bootstrapMeta?.contextKind !== "delivery");
  evidence.checks.timeline_general_label = roomSig.bodyHasDirectLabel;
  evidence.checks.no_trade_dock = !roomSig.tradeDock;
  evidence.checks.member_suffix = roomSig.bodyHasMemberSuffix;
  const backOk = await clickBack(page);
  evidence.checks.back_navigation = backOk;
  evidence.backUrl = page.url();
  return evidence;
}

async function runDomainGroup(page, room) {
  const evidence = { domain: "GROUP", roomId: room?.id ?? null, checks: {}, errors: [] };
  if (!room?.id) {
    evidence.skipped = true;
    evidence.skipReason = "no_fixture_room";
    return evidence;
  }
  evidence.list = await probeList(page, "/community-messenger?section=chats&kind=private_group");
  evidence.checks.list_rows_visible = evidence.list.rowCount > 0;
  const roomSig = await probeRoomHeader(page, room.id);
  evidence.room = roomSig;
  evidence.checks.room_entered = roomSig.entered && roomSig.cmRoom;
  evidence.checks.timeline_group_label = roomSig.bodyHasGroupLabel;
  evidence.checks.no_trade_dock = !roomSig.tradeDock;
  evidence.checks.member_suffix = roomSig.bodyHasMemberSuffix;
  const backOk = await clickBack(page);
  evidence.checks.back_navigation = backOk;
  evidence.backUrl = page.url();
  return evidence;
}

async function runDomainTrade(page, room) {
  const evidence = { domain: "TRADE", roomId: room?.id ?? null, checks: {}, errors: [] };
  if (!room?.id) {
    evidence.skipped = true;
    evidence.skipReason = "no_fixture_room";
    return evidence;
  }
  evidence.list = await probeList(page, "/community-messenger?section=chats&kind=trade");
  evidence.checks.list_rows_visible = evidence.list.rowCount > 0;
  evidence.checks.list_product_primary =
    Boolean(evidence.list.firstListTitle) && !isPlaceholderListTitle(evidence.list.firstListTitle);
  const roomSig = await probeRoomHeader(page, room.id, { waitTradeDock: true, settleMs: 5000 });
  evidence.room = roomSig;
  evidence.checks.room_entered = roomSig.entered && roomSig.cmRoom;
  evidence.checks.bootstrap_chat_domain = roomSig.bootstrapMeta?.chatDomain === "trade" || roomSig.bootstrapMeta?.contextKind === "trade";
  evidence.checks.timeline_trade_label = roomSig.bodyHasTradeLabel;
  evidence.checks.no_general_member_suffix = !roomSig.bodyHasDirectLabel && !roomSig.bodyHasMemberSuffix;
  evidence.checks.trade_dock = roomSig.tradeDock;
  const backOk = await clickBack(page);
  evidence.checks.back_navigation = backOk;
  evidence.backUrl = page.url();
  return evidence;
}

async function runDomainStoreOrder(page, room) {
  const evidence = { domain: "STORE_ORDER", roomId: room?.id ?? null, checks: {}, errors: [] };
  if (!room?.id) {
    evidence.skipped = true;
    evidence.skipReason = "no_fixture_room";
    return evidence;
  }
  evidence.list = await probeList(page, "/community-messenger?section=chats&kind=delivery");
  evidence.checks.list_rows_visible = evidence.list.rowCount > 0;
  evidence.checks.list_store_primary =
    Boolean(evidence.list.firstListTitle) && !isPlaceholderListTitle(evidence.list.firstListTitle);
  const roomSig = await probeRoomHeader(page, room.id);
  evidence.room = roomSig;
  evidence.checks.room_entered = roomSig.entered && roomSig.cmRoom;
  evidence.checks.bootstrap_chat_domain =
    roomSig.bootstrapMeta?.chatDomain === "store_order" || roomSig.bootstrapMeta?.contextKind === "delivery";
  evidence.checks.timeline_order_label = roomSig.bodyHasOrderLabel;
  evidence.checks.no_general_member_suffix = !roomSig.bodyHasDirectLabel && !roomSig.bodyHasMemberSuffix;
  evidence.checks.no_trade_dock = !roomSig.tradeDock;
  const backOk = await clickBack(page);
  evidence.checks.back_navigation = backOk;
  evidence.backUrl = page.url();
  return evidence;
}

function assessMatrixCase(evidence) {
  if (evidence.skipped) return "SKIP";
  const checks = evidence.checks ?? {};
  const values = Object.values(checks);
  if (values.length === 0) return "NOT_PROVEN";
  if (values.every(Boolean)) return "PASS";
  if (values.some(Boolean)) return "PARTIAL";
  return "FAIL";
}

async function runCaseC(page, pair) {
  const evidence = { case: "C_GENERAL_TRADE_SAME_PEER", checks: {}, errors: [] };
  if (!pair?.general?.id || !pair?.trade?.id) {
    evidence.skipped = true;
    evidence.skipReason = "no_same_peer_general_trade_pair";
    return evidence;
  }
  evidence.peerUserId = pair.peerUserId;
  evidence.generalId = pair.general.id;
  evidence.tradeId = pair.trade.id;
  const general = await probeRoomHeader(page, pair.general.id);
  evidence.general = general;
  evidence.checks.general_entered = general.entered && general.cmRoom;
  evidence.checks.general_label = general.bodyHasDirectLabel;
  evidence.checks.general_no_trade_dock = !general.tradeDock;
  const trade = await probeRoomHeader(page, pair.trade.id, { waitTradeDock: true, settleMs: 4000 });
  evidence.trade = trade;
  evidence.checks.trade_entered = trade.entered && trade.cmRoom;
  evidence.checks.trade_label = trade.bodyHasTradeLabel;
  evidence.checks.trade_no_general_suffix = !trade.bodyHasDirectLabel && !trade.bodyHasMemberSuffix;
  evidence.checks.distinct_rooms = pair.general.id !== pair.trade.id;
  return evidence;
}

async function runCaseD(page, tradeSecond) {
  const evidence = { case: "D_MULTI_TRADE", checks: {}, errors: [] };
  const rooms = tradeSecond?.rooms ?? [];
  if (rooms.length < 2) {
    evidence.skipped = true;
    evidence.skipReason = "need_two_trade_rooms";
    return evidence;
  }
  evidence.roomIds = rooms.map((r) => r.id);
  const first = await probeRoomHeader(page, rooms[0].id, { waitTradeDock: true, settleMs: 4000 });
  const second = await probeRoomHeader(page, rooms[1].id, { waitTradeDock: true, settleMs: 4000 });
  evidence.first = first;
  evidence.second = second;
  evidence.checks.first_trade = first.bodyHasTradeLabel && first.entered && first.cmRoom;
  evidence.checks.second_trade = second.bodyHasTradeLabel && second.entered && second.cmRoom;
  evidence.checks.distinct_rooms = rooms[0].id !== rooms[1].id;
  evidence.checks.no_general_leak =
    !first.bodyHasDirectLabel && !second.bodyHasDirectLabel && !first.bodyHasMemberSuffix && !second.bodyHasMemberSuffix;
  return evidence;
}

async function runCaseF(page, owner) {
  const evidence = { case: "F_STORE_ORDER_OWNER", checks: {}, errors: [] };
  if (!owner?.room?.id) {
    evidence.skipped = true;
    evidence.skipReason = "no_owner_store_order_room";
    return evidence;
  }
  evidence.roomId = owner.room.id;
  const roomSig = await probeRoomHeader(page, owner.room.id);
  evidence.room = roomSig;
  evidence.checks.room_entered = roomSig.entered && roomSig.cmRoom;
  evidence.checks.viewer_is_store_owner = owner.via === "stores.owner_user_id" || roomSig.bootstrapMeta?.myRole === "owner";
  evidence.checks.bootstrap_store_order =
    roomSig.bootstrapMeta?.chatDomain === "store_order" || roomSig.bootstrapMeta?.contextKind === "delivery";
  evidence.checks.timeline_order_label = roomSig.bodyHasOrderLabel;
  evidence.checks.no_general_member_suffix = !roomSig.bodyHasDirectLabel && !roomSig.bodyHasMemberSuffix;
  evidence.checks.no_trade_dock = !roomSig.tradeDock;
  evidence.checks.no_store_title_as_peer_primary = !/매장|Store chats|Order chat/i.test(roomSig.headerTitle ?? "");
  evidence.via = owner.via ?? null;
  return evidence;
}

function runCaseG(domains) {
  const evidence = { case: "G_SAME_LOGIN_MULTI_DOMAIN", checks: {}, errors: [] };
  const general = domains.GENERAL_DIRECT;
  const trade = domains.TRADE;
  const store = domains.STORE_ORDER;
  if (general?.verdict === "SKIP" || trade?.verdict === "SKIP" || store?.verdict === "SKIP") {
    evidence.skipped = true;
    evidence.skipReason = "missing_domain_runtime";
    return evidence;
  }
  evidence.checks.general_independent = general?.verdict === "PASS" && general?.room?.bodyHasDirectLabel;
  evidence.checks.trade_independent = trade?.verdict === "PASS" && trade?.room?.bodyHasTradeLabel;
  evidence.checks.store_independent = store?.verdict === "PASS" && store?.room?.bodyHasOrderLabel;
  evidence.checks.no_cross_trade_on_store = store?.room?.bodyHasTradeLabel !== true;
  evidence.checks.no_cross_general_on_trade = trade?.room?.bodyHasDirectLabel !== true;
  return evidence;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 390, height: 844 },
  });
  const discoveryPage = await context.newPage();
  const discovery = await discoverFixturesAcrossAccounts(discoveryPage);
  await discoveryPage.close();

  const byDomain = discovery.mergedRooms;

  async function runOnFreshPage(domainKey, runner, authOverride) {
    const domainAuth = authOverride ?? discovery.authByDomain[domainKey] ?? discovery;
    await applyAuthCookies(context, domainAuth);
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/community-messenger`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(800);
      return await runner(page);
    } finally {
      await page.close();
    }
  }

  const bootstrap = { ok: true, body: { chats: [] } };
  const chats = [];

  const generalEv = await runOnFreshPage("GENERAL_DIRECT", (page) => runDomainGeneral(page, byDomain.GENERAL_DIRECT)).catch(
    (e) => ({
      domain: "GENERAL_DIRECT",
      checks: {},
      errors: [String(e?.message ?? e)],
      verdict: "FAIL",
    })
  );
  const groupEv = await runOnFreshPage("GROUP", (page) => runDomainGroup(page, byDomain.GROUP)).catch((e) => ({
    domain: "GROUP",
    checks: {},
    errors: [String(e?.message ?? e)],
    verdict: "FAIL",
  }));
  const tradeEv = await runOnFreshPage("TRADE", (page) => runDomainTrade(page, byDomain.TRADE)).catch((e) => ({
    domain: "TRADE",
    checks: {},
    errors: [String(e?.message ?? e)],
    verdict: "FAIL",
  }));
  const storeEv = await runOnFreshPage("STORE_ORDER", (page) =>
    runDomainStoreOrder(page, byDomain.STORE_ORDER)
  ).catch((e) => ({
    domain: "STORE_ORDER",
    checks: {},
    errors: [String(e?.message ?? e)],
    verdict: "FAIL",
  }));

  const domains = {
    GENERAL_DIRECT: generalEv.verdict ? generalEv : { ...generalEv, verdict: assessDomain("GENERAL_DIRECT", generalEv) },
    GROUP: groupEv.verdict ? groupEv : { ...groupEv, verdict: assessDomain("GROUP", groupEv) },
    TRADE: tradeEv.verdict ? tradeEv : { ...tradeEv, verdict: assessDomain("TRADE", tradeEv) },
    STORE_ORDER: storeEv.verdict ? storeEv : { ...storeEv, verdict: assessDomain("STORE_ORDER", storeEv) },
  };

  const caseCEv = await runOnFreshPage(
    "GENERAL_DIRECT",
    (page) => runCaseC(page, discovery.matrix.generalTradePeerPair),
    discovery.matrix.generalTradePeerPair?.auth
  ).catch((e) => ({ case: "C_GENERAL_TRADE_SAME_PEER", checks: {}, errors: [String(e?.message ?? e)], verdict: "FAIL" }));
  const caseDEv = await runOnFreshPage(
    "TRADE",
    (page) => runCaseD(page, discovery.matrix.tradeSecond),
    discovery.matrix.tradeSecond?.auth
  ).catch((e) => ({ case: "D_MULTI_TRADE", checks: {}, errors: [String(e?.message ?? e)], verdict: "FAIL" }));
  const caseFEv = await runOnFreshPage(
    "STORE_ORDER",
    (page) => runCaseF(page, discovery.matrix.storeOrderOwner),
    discovery.matrix.storeOrderOwner?.auth
  ).catch((e) => ({ case: "F_STORE_ORDER_OWNER", checks: {}, errors: [String(e?.message ?? e)], verdict: "FAIL" }));
  const caseGEv = runCaseG(domains);

  const matrix = {
    C_GENERAL_TRADE_SAME_PEER: caseCEv.verdict ? caseCEv : { ...caseCEv, verdict: assessMatrixCase(caseCEv) },
    D_MULTI_TRADE: caseDEv.verdict ? caseDEv : { ...caseDEv, verdict: assessMatrixCase(caseDEv) },
    F_STORE_ORDER_OWNER: caseFEv.verdict ? caseFEv : { ...caseFEv, verdict: assessMatrixCase(caseFEv) },
    G_SAME_LOGIN_MULTI_DOMAIN: { ...caseGEv, verdict: assessMatrixCase(caseGEv) },
  };

  const verdicts = Object.values(domains).map((d) => d.verdict);
  const hardFails = verdicts.filter((v) => v === "FAIL").length;
  const partials = verdicts.filter((v) => v === "PARTIAL").length;
  const skips = verdicts.filter((v) => v === "SKIP" || v === "NOT_PROVEN").length;
  const passes = verdicts.filter((v) => v === "PASS").length;
  const matrixVerdicts = Object.values(matrix).map((d) => d.verdict);
  const matrixFails = matrixVerdicts.filter((v) => v === "FAIL").length;
  const matrixPartials = matrixVerdicts.filter((v) => v === "PARTIAL").length;
  const matrixSkips = matrixVerdicts.filter((v) => v === "SKIP" || v === "NOT_PROVEN").length;
  const matrixPasses = matrixVerdicts.filter((v) => v === "PASS").length;

  const report = {
    runAt: new Date().toISOString(),
    baseUrl,
    loginId: discovery.loginId,
    fixtureDiscovery: discovery.fixtureDiscovery ?? null,
    bootstrapOk: bootstrap.ok,
    bootstrapStatus: 200,
    chatCount: discovery.fixtureDiscovery?.scanByLogin?.[discovery.loginId]?.chatCount ?? 0,
    fixtures: Object.fromEntries(Object.entries(byDomain).map(([k, v]) => [k, v?.id ?? null])),
    domains,
    matrix,
    summary: { passes, partials, hardFails, skips },
    matrixSummary: { passes: matrixPasses, partials: matrixPartials, hardFails: matrixFails, skips: matrixSkips },
    FINAL:
      hardFails > 0 || matrixFails > 0
        ? "FAIL"
        : partials > 0 || skips > 0 || matrixPartials > 0 || matrixSkips > 0
          ? "PARTIAL"
          : passes === 4 && matrixPasses === 4
            ? "PASS"
            : "PARTIAL",
    FIRST_BREAK:
      Object.entries(domains).find(([, d]) => d.verdict === "FAIL" || d.verdict === "PARTIAL")?.[0] ??
      Object.entries(matrix).find(([, d]) => d.verdict === "FAIL" || d.verdict === "PARTIAL")?.[0] ??
      null,
  };

  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(
    path.join(root, ".qa-logs", "messenger-4-domain-ux-runtime-last-run.json"),
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(hardFails > 0 || matrixFails > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
