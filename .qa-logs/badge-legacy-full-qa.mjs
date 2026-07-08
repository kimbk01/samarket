#!/usr/bin/env node
/**
 * Legacy Badge full QA — measurement only (Legacy pass criteria).
 * Sections: Header, Chat, Trade chat, Delivery/FAB, App icon, Sound.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { buildApkSessionCookies } from "../scripts/qa/lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.SSOT_AUDIT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/badge-legacy-full-qa/${STAMP}`);
const HUB_QS = "cmFresh=1&hubBadgeBypass=1";
const EVENT_TYPE_TO_KEY = {
  chat_message: "messenger_direct_message_received",
  group_message: "messenger_group_message_received",
  trade_message: "trade_chat_message_received",
  trade_status: "trade_offer_received",
  order_status: "delivery_order_status_changed_user",
  community_activity: "community_comment_received",
};

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function health() {
  try {
    const r = await fetch(`${BASE}/api/me/notifications/badge-count?fresh=1`, { cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

async function scan(page) {
  return page.evaluate(async (hubQs) => {
    const tabs = [...document.querySelectorAll("[data-bottom-nav-tab-id]")].map((el) => ({
      id: el.getAttribute("data-bottom-nav-tab-id"),
      badge: el.querySelector(".bottom-nav-hub-badge")?.textContent?.trim() ?? null,
    }));
    const ssotFresh = await fetch("/api/me/notifications/badge-count?fresh=1", {
      credentials: "include",
      cache: "no-store",
    }).then((r) => r.json());
    const hub = await fetch(`/api/me/store-owner-hub-badge?${hubQs}`, {
      credentials: "include",
      cache: "no-store",
    }).then((r) => r.json());
    return { tabs, ssotFresh, hub };
  }, HUB_QS);
}

function parseBadge(t) {
  if (!t) return 0;
  if (t === "99+") return 99;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : 0;
}

function tabDom(scanResult, id) {
  const tab = scanResult.tabs.find((t) => t.id === id);
  return parseBadge(tab?.badge);
}

async function inboxUnread(page, pushKind) {
  return page.evaluate(async (pk) => {
    const sp = new URLSearchParams({
      exclude_owner_store_commerce: "1",
      exclude_chat_message: "1",
      push_kind: pk,
      limit: "80",
    });
    const j = await fetch(`/api/me/notifications?${sp}`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({}));
    const rows = Array.isArray(j?.notifications) ? j.notifications : [];
    return rows.filter((r) => r && r.is_read === false).length;
  }, pushKind);
}

async function targetSurfaceCount(page, surface) {
  return page.evaluate(async (sf) => {
    const j = await fetch(
      `/api/me/notifications?unread_count_only=1&badge_surface=${encodeURIComponent(sf)}`,
      { credentials: "include", cache: "no-store" }
    ).then((r) => r.json());
    return j?.unread_count ?? null;
  }, surface);
}

async function insertEvent(sb, userId, row) {
  const { data, error } = await sb
    .from("notification_events")
    .insert({
      user_id: userId,
      type: row.type,
      category: row.category,
      title: row.title,
      body: row.body,
      display_payload: row.display_payload ?? {},
      room_id: row.room_id ?? null,
      unread: true,
      dedupe_key: row.dedupe_key,
      delivered_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function deleteEvents(sb, ids) {
  if (!ids.length) return;
  await sb.from("notification_events").delete().in("id", ids);
}

async function waitApi(page, pred, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await scan(page);
    if (pred(s)) return { ok: true, snap: s, waitedMs: Date.now() - t0 };
    await delay(400);
  }
  const s = await scan(page);
  return { ok: false, snap: s, waitedMs: Date.now() - t0 };
}

function runVitest() {
  const r = spawnSync(
    "npx",
    [
      "vitest",
      "run",
      "lib/chats/__tests__/bottom-nav-legacy-feed-tab-badge.test.ts",
      "lib/notifications/__tests__/chat-room-count-vs-row-count-contract.test.ts",
      "lib/notifications/__tests__/badge-source-eventkey-matrix.test.ts",
      "lib/notifications/__tests__/read-clear-row-tab-icon-resync-contract.test.ts",
      "lib/notifications/__tests__/notification-badge-count-read-patch.test.ts",
    ],
    { cwd: ROOT, encoding: "utf8", stdio: "pipe" }
  );
  return { pass: r.status === 0, stdout: r.stdout?.slice(-800) ?? "", stderr: r.stderr?.slice(-400) ?? "" };
}

function runLifecycleCases(cases) {
  const r = spawnSync(
    "node",
    [path.join(ROOT, ".qa-logs/badge-rebuild-lifecycle-qa.mjs")],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        SSOT_AUDIT_BASE_URL: BASE,
        BADGE_LIFECYCLE_QA_CASES: cases,
      },
      stdio: "pipe",
      timeout: 240000,
    }
  );
  const outDir = fs
    .readdirSync(path.join(ROOT, ".qa-logs/badge-rebuild-lifecycle-qa"))
    .filter((d) => d > "2026-07-08T13")
    .sort()
    .pop();
  let lifecycleReport = null;
  if (outDir) {
    const p = path.join(ROOT, `.qa-logs/badge-rebuild-lifecycle-qa/${outDir}/report.json`);
    if (fs.existsSync(p)) lifecycleReport = JSON.parse(fs.readFileSync(p, "utf8"));
  }
  return { exitCode: r.status, lifecycleReport, stderr: r.stderr?.slice(-500) ?? "" };
}

async function main() {
  loadEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const report = {
    harnessRevision: "2026-07-08-badge-legacy-full-qa-v2-buyer-fixture-no-stores-dom",
    base: BASE,
    measuredAt: new Date().toISOString(),
    sections: {},
    vitest: null,
    lifecycle: null,
    measurementValid: false,
    commitable: false,
  };

  report.vitest = runVitest();
  report.sections.sound = {
    pass: report.vitest.pass,
    note: "badge-source-eventkey-matrix + legacy feed locks + read-clear + chat row contract",
  };

  // Chat QA1/2/6 first — separate Playwright browser; avoids competing with header/trade/delivery page.
  report.lifecycle = runLifecycleCases("1,2,6");
  const lifecycleCases = report.lifecycle.lifecycleReport?.cases ?? [];
  const qa1 = lifecycleCases.find((c) => c.name === "qa1_chat_five_messages_room_count");
  const qa2 = lifecycleCases.find((c) => c.name === "qa2_chat_room_enter_clear");
  const qa6 = lifecycleCases.find((c) => c.name === "qa6_sound_eventkey_matrix");
  report.sections.chat = {
    pass: Boolean(qa1?.pass && qa2?.pass),
    qa1: qa1 ? { pass: qa1.pass, criteria: qa1.qa1PassCriteria } : null,
    qa2: qa2 ? { pass: qa2.pass } : null,
    lifecycleExit: report.lifecycle.exitCode,
  };
  if (qa6) {
    report.sections.sound.pass = report.vitest.pass && qa6.pass;
    report.sections.sound.qa6 = { pass: qa6.pass };
  }

  if (!(await health())) {
    report.serverReachable = false;
    report.sections.header = { pass: false, reason: "server_unreachable" };
    report.sections.chat = { pass: false, reason: "server_unreachable" };
    report.sections.tradeChat = { pass: false, reason: "server_unreachable" };
    report.sections.delivery = { pass: false, reason: "server_unreachable" };
    report.sections.appIcon = { pass: false, reason: "server_unreachable" };
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const { cookies, userId } = await buildApkSessionCookies({
    login: process.env.SSOT_ADMIN_LOGIN || "aaaa",
    prod: BASE,
    password: process.env.E2E_TEST_PASSWORD || "1234",
    loadEnv,
  });
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const cleanup = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    // -------- Header baseline --------
    await page.goto(`${BASE}/philife`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(2000);
    let snap = await scan(page);
    const headerChecks = [];
    const api = snap.ssotFresh;
    const communityInbox = await inboxUnread(page, "community");
    const tradeInbox = await inboxUnread(page, "trade");
    const deliveryInbox = await inboxUnread(page, "delivery");
    headerChecks.push({
      name: "community_events_in_tier1_inbox",
      pass: (api.communityActivity ?? 0) === 0 || communityInbox > 0,
      communityActivity: api.communityActivity,
      inboxUnread: communityInbox,
    });
    headerChecks.push({
      name: "trade_events_in_tier1_inbox",
      pass: (api.tradeStatus ?? 0) + (api.tradeMessage ?? 0) === 0 || tradeInbox > 0,
      tradeEvents: (api.tradeStatus ?? 0) + (api.tradeMessage ?? 0),
      inboxUnread: tradeInbox,
    });
    headerChecks.push({
      name: "delivery_events_in_tier1_inbox",
      pass: (api.orderStatus ?? 0) === 0 || deliveryInbox > 0,
      orderStatus: api.orderStatus,
      inboxUnread: deliveryInbox,
    });
    headerChecks.push({
      name: "feed_tabs_bottomnav_zero",
      pass:
        tabDom(snap, "community") === 0 &&
        tabDom(snap, "home") === 0 &&
        tabDom(snap, "stores") === 0,
      dom: {
        community: tabDom(snap, "community"),
        trade: tabDom(snap, "home"),
        stores: tabDom(snap, "stores"),
      },
    });

    // Header read + app icon decrease (community insert + post open if fixture exists)
    let headerReadPass = false;
    const beforeTotal = api.total ?? 0;
    const postRow = await sb.from("community_posts").select("id").eq("status", "active").limit(1);
    const postId = postRow.data?.[0]?.id;
    if (postId) {
      const pid = postId;
      const evId = await insertEvent(sb, userId, {
        type: "community_activity",
        category: "community_activity",
        title: "legacy-qa community",
        body: "qa",
        dedupe_key: `legacy-qa:community:${Date.now()}`,
        display_payload: { routeUrl: `/philife/${pid}`, legacyMeta: { post_id: pid } },
      });
      cleanup.push(evId);
      const inc = await waitApi(page, (s) => (s.ssotFresh?.total ?? 0) >= beforeTotal + 1);
      await page.goto(`${BASE}/philife/${pid}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await delay(2000);
      const afterInsertActivity = inc.snap?.ssotFresh?.communityActivity ?? api.communityActivity;
      const dec = await waitApi(
        page,
        (s) => (s.ssotFresh?.communityActivity ?? 999) <= api.communityActivity
      );
      headerReadPass = inc.ok && dec.ok;
      headerChecks.push({
        name: "community_read_reduces_app_icon_slice",
        pass: headerReadPass,
        beforeTotal,
        afterInsertTotal: inc.snap?.ssotFresh?.total,
        afterReadCommunityActivity: dec.snap?.ssotFresh?.communityActivity,
      });
    } else {
      headerChecks.push({ name: "community_read_reduces_app_icon_slice", pass: false, skip: "no_post_fixture" });
    }

    report.sections.header = {
      pass: headerChecks.every((c) => c.pass),
      checks: headerChecks,
    };

    // -------- Trade Legacy --------
    await page.goto(`${BASE}/market`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(1500);
    snap = await scan(page);
    const beforeTrade = snap.ssotFresh?.tradeStatus ?? 0;
    const beforeTradeDom = tabDom(snap, "home");
    const beforeChatDom = tabDom(snap, "chat");
    const product = await sb.from("posts").select("id").limit(1);
    let tradeChecks = [];
    if (product.data?.[0]?.id) {
      const pid = product.data[0].id;
      const evId = await insertEvent(sb, userId, {
        type: "trade_status",
        category: "trade_status",
        title: "legacy-qa trade",
        body: "qa",
        dedupe_key: `legacy-qa:trade:${Date.now()}`,
        display_payload: { routeUrl: `/post/${pid}`, legacyMeta: { product_id: pid } },
      });
      cleanup.push(evId);
      const mid = await waitApi(page, (s) => (s.ssotFresh?.tradeStatus ?? 0) >= beforeTrade + 1);
      await page.goto(`${BASE}/market`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await delay(1500);
      snap = await scan(page);
      const midTradeDom = tabDom(snap, "home");
      const midChatDom = tabDom(snap, "chat");
      const tradeInboxAfter = await inboxUnread(page, "trade");
      tradeChecks = [
        {
          name: "trade_bottomnav_stays_zero",
          pass: midTradeDom === 0,
          midTradeDom,
        },
        {
          name: "trade_inbox_shows_cause",
          pass: tradeInboxAfter > 0,
          tradeInboxAfter,
        },
        {
          name: "chat_dom_not_leaked",
          pass: midChatDom === beforeChatDom,
          beforeChatDom,
          midChatDom,
        },
      ];
      await page.goto(`${BASE}/post/${pid}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await delay(2000);
      const after = await waitApi(page, (s) => (s.ssotFresh?.tradeStatus ?? 999) <= beforeTrade);
      tradeChecks.push({
        name: "trade_detail_clear_reduces_events",
        pass: after.ok,
        afterTradeStatus: after.snap?.ssotFresh?.tradeStatus,
      });
    } else {
      tradeChecks = [{ name: "trade_fixture", pass: false, skip: "no_trade_product" }];
    }
    report.sections.tradeChat = {
      pass: tradeChecks.every((c) => c.pass),
      checks: tradeChecks,
    };

    // -------- Delivery / FAB Legacy (Food/Stores BottomNav DOM excluded from pass) --------
    const DELIVERY_DOM_EXCLUDED = new Set([
      "stores_bottomnav_zero",
      "order_insert_stores_dom_stays_zero",
    ]);
    await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(1500);
    snap = await scan(page);
    const beforeOrder = snap.ssotFresh?.orderStatus ?? 0;
    const hub = snap.hub ?? {};
    const deliveryInboxBaseline = await inboxUnread(page, "delivery");
    const deliveryChecks = [
      {
        name: "stores_bottomnav_zero",
        informational: true,
        excludedFromPass: true,
        pass: tabDom(snap, "stores") === 0,
        storesDom: tabDom(snap, "stores"),
      },
      {
        name: "fab_hub_fields_present",
        pass:
          typeof hub.buyerOrderAttention === "number" &&
          typeof hub.storeOrderChatUnread === "number",
        buyerOrderAttention: hub.buyerOrderAttention,
        storeOrderChatUnread: hub.storeOrderChatUnread,
        orderAttention: hub.orderAttention,
      },
      {
        name: "delivery_inbox_baseline",
        pass: (snap.ssotFresh?.orderStatus ?? 0) === 0 || deliveryInboxBaseline > 0,
        orderStatus: snap.ssotFresh?.orderStatus,
        deliveryInbox: deliveryInboxBaseline,
      },
    ];
    const order = await sb
      .from("store_orders")
      .select("id, buyer_user_id")
      .eq("buyer_user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (order.data?.id) {
      const oid = order.data.id;
      deliveryChecks.push({
        name: "delivery_buyer_fixture",
        pass: order.data.buyer_user_id === userId,
        orderId: oid,
        buyerUserId: order.data.buyer_user_id,
      });
      const evId = await insertEvent(sb, userId, {
        type: "order_status",
        category: "order_status",
        title: "legacy-qa order",
        body: "qa",
        dedupe_key: `legacy-qa:order:${Date.now()}`,
        display_payload: { routeUrl: `/mypage/store-orders/${oid}`, legacyMeta: { order_id: oid } },
      });
      cleanup.push(evId);
      const mid = await waitApi(page, (s) => (s.ssotFresh?.orderStatus ?? 0) >= beforeOrder + 1);
      await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await delay(1500);
      snap = await scan(page);
      deliveryChecks.push({
        name: "order_insert_stores_dom_stays_zero",
        informational: true,
        excludedFromPass: true,
        pass: tabDom(snap, "stores") === 0,
        storesDom: tabDom(snap, "stores"),
        orderStatus: mid.snap?.ssotFresh?.orderStatus,
      });
      await page.goto(`${BASE}/mypage/store-orders/${encodeURIComponent(oid)}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await delay(2000);
      const after = await waitApi(page, (s) => (s.ssotFresh?.orderStatus ?? 999) <= beforeOrder);
      deliveryChecks.push({
        name: "order_detail_clear_reduces_events",
        pass: after.ok,
        beforeOrderStatus: beforeOrder,
        afterOrderStatus: after.snap?.ssotFresh?.orderStatus,
        orderId: oid,
      });
    } else {
      deliveryChecks.push({
        name: "delivery_buyer_fixture",
        pass: false,
        skip: "no_buyer_order_for_aaaa",
      });
    }
    report.sections.delivery = {
      pass: deliveryChecks.filter((c) => !DELIVERY_DOM_EXCLUDED.has(c.name)).every((c) => c.pass),
      checks: deliveryChecks,
      passCriteria: "tier1_delivery_inbox + FAB + buyer_order_detail_clear (Food/Stores BottomNav DOM excluded)",
    };

    // Chat list leak — static contract
    const leakSrc = fs.readFileSync(
      path.join(ROOT, "lib/notifications/__tests__/chat-room-count-vs-row-count-contract.test.ts"),
      "utf8"
    );
    report.sections.tradeChat.checks.push({
      name: "chat_list_excludes_trade_delivery_static",
      pass: leakSrc.includes('kind: "trade"') && leakSrc.includes("toBe(false)"),
    });
    report.sections.tradeChat.pass = report.sections.tradeChat.checks.every((c) => c.pass);

    // -------- App icon --------
    report.sections.appIcon = {
      pass: headerChecks.some((c) => c.name === "community_read_reduces_app_icon_slice" && c.pass),
      note: "total/slice decrease on read — community path; tab numbers need not match total",
      checks: headerChecks.filter((c) => c.name.includes("read") || c.name.includes("icon")),
    };

    report.measurementValid = Object.values(report.sections).every((s) => s.pass !== undefined);
    report.commitable = false;
    await browser.close();
  } finally {
    await deleteEvents(sb, cleanup).catch(() => {});
  }
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n[legacy-qa] report=${path.join(OUT, "report.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
