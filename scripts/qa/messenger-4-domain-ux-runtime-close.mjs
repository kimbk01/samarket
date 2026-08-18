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

function loginIdCandidates() {
  return [...new Set([process.env.E2E_TEST_USERNAME?.trim(), "aa11", "aaaa", "wwww", "qqqq", "bbbb"].filter(Boolean))];
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
    const chats = bootstrap.body?.chats ?? bootstrap.body?.data?.chats ?? [];
    const fixtures = { GENERAL_DIRECT: null, GROUP: null, TRADE: null, STORE_ORDER: null };
    for (const room of chats) {
      const d = classifyRoom(room);
      if (d in fixtures && !fixtures[d]) fixtures[d] = room?.id ?? null;
      if (d in mergedFixtures && !mergedFixtures[d] && room?.id) {
        mergedFixtures[d] = room.id;
        mergedRooms[d] = room;
        authByDomain[d] = auth;
      }
    }
    scanByLogin[loginId] = {
      ok: bootstrap.ok,
      chatCount: chats.length,
      fixtures,
      hasActiveSessionCookie: auth.cookies.some((c) => c.name === "samarket_active_session_id"),
    };
    if (Object.values(mergedFixtures).every(Boolean)) break;
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
    },
    mergedRooms,
    authByDomain,
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
  if (room.roomType === "private_group" || room.roomType === "open_group") return "GROUP";
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
  const back = page.getByRole("button", { name: /이전 화면|Go back|뒤로|Back/i }).first();
  if (await back.isVisible({ timeout: 3000 }).catch(() => false)) {
    await back.click({ timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
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
  const listPass = checks.list_rows_visible !== false;
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
  await page.goto(`${baseUrl}/community-messenger/rooms/${encodeURIComponent(room.id)}`, {
    waitUntil: "commit",
    timeout: 45_000,
  });
  await page.waitForTimeout(1500);
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
  evidence.list = await probeList(page, "/community-messenger?section=chats");
  evidence.checks.list_rows_visible = evidence.list.rowCount > 0;
  const roomSig = await probeRoomHeader(page, room.id);
  evidence.room = roomSig;
  evidence.checks.room_entered = roomSig.entered && roomSig.cmRoom;
  evidence.checks.timeline_group_label = roomSig.bodyHasGroupLabel;
  evidence.checks.no_trade_dock = !roomSig.tradeDock;
  evidence.checks.member_suffix = roomSig.bodyHasMemberSuffix;
  await page.goto(`${baseUrl}/community-messenger/rooms/${encodeURIComponent(room.id)}`, {
    waitUntil: "commit",
    timeout: 45_000,
  });
  await page.waitForTimeout(1500);
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
  evidence.list = await probeList(page, "/community-messenger/trade-chats");
  evidence.checks.list_rows_visible = evidence.list.rowCount > 0;
  evidence.checks.list_product_primary = Boolean(evidence.list.firstListTitle);
  const roomSig = await probeRoomHeader(page, room.id, { waitTradeDock: true, settleMs: 5000 });
  evidence.room = roomSig;
  evidence.checks.room_entered = roomSig.entered && roomSig.cmRoom;
  evidence.checks.bootstrap_chat_domain = roomSig.bootstrapMeta?.chatDomain === "trade" || roomSig.bootstrapMeta?.contextKind === "trade";
  evidence.checks.timeline_trade_label = roomSig.bodyHasTradeLabel;
  evidence.checks.no_general_member_suffix = !roomSig.bodyHasDirectLabel && !roomSig.bodyHasMemberSuffix;
  evidence.checks.trade_dock = roomSig.tradeDock;
  await page.goto(
    `${baseUrl}/community-messenger/rooms/${encodeURIComponent(room.id)}?return=${encodeURIComponent("/community-messenger/trade-chats")}`,
    { waitUntil: "commit", timeout: 45_000 }
  );
  await page.waitForTimeout(1500);
  const backOk = await clickBack(page);
  evidence.checks.back_navigation = backOk && page.url().includes("/community-messenger/trade-chats");
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
  evidence.list = await probeList(page, "/community-messenger/delivery-chats");
  evidence.checks.list_rows_visible = evidence.list.rowCount > 0;
  evidence.checks.list_store_primary = Boolean(evidence.list.firstListTitle);
  const roomSig = await probeRoomHeader(page, room.id);
  evidence.room = roomSig;
  evidence.checks.room_entered = roomSig.entered && roomSig.cmRoom;
  evidence.checks.bootstrap_chat_domain =
    roomSig.bootstrapMeta?.chatDomain === "store_order" || roomSig.bootstrapMeta?.contextKind === "delivery";
  evidence.checks.timeline_order_label = roomSig.bodyHasOrderLabel;
  evidence.checks.no_general_member_suffix = !roomSig.bodyHasDirectLabel && !roomSig.bodyHasMemberSuffix;
  evidence.checks.no_trade_dock = !roomSig.tradeDock;
  await page.goto(
    `${baseUrl}/community-messenger/rooms/${encodeURIComponent(room.id)}?return=${encodeURIComponent("/community-messenger/delivery-chats")}`,
    { waitUntil: "commit", timeout: 45_000 }
  );
  await page.waitForTimeout(1500);
  const backOk = await clickBack(page);
  evidence.checks.back_navigation = backOk && page.url().includes("/community-messenger/delivery-chats");
  evidence.backUrl = page.url();
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

  async function runOnFreshPage(domainKey, runner) {
    const domainAuth = discovery.authByDomain[domainKey] ?? discovery;
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

  const verdicts = Object.values(domains).map((d) => d.verdict);
  const hardFails = verdicts.filter((v) => v === "FAIL").length;
  const partials = verdicts.filter((v) => v === "PARTIAL").length;
  const skips = verdicts.filter((v) => v === "SKIP" || v === "NOT_PROVEN").length;
  const passes = verdicts.filter((v) => v === "PASS").length;

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
    summary: { passes, partials, hardFails, skips },
    FINAL:
      hardFails > 0 ? "FAIL" : partials > 0 || skips > 0 ? "PARTIAL" : passes === 4 ? "PASS" : "PARTIAL",
    FIRST_BREAK:
      Object.entries(domains).find(([, d]) => d.verdict === "FAIL" || d.verdict === "PARTIAL")?.[0] ?? null,
  };

  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(
    path.join(root, ".qa-logs", "messenger-4-domain-ux-runtime-last-run.json"),
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(hardFails > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
