#!/usr/bin/env node
/**
 * Bell modal runtime QA — PhilifeHeaderNotificationInbox measurement only.
 * No Food/Stores BottomNav assertions.
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
const OUT = path.join(ROOT, `.qa-logs/bell-modal-runtime-qa/${STAMP}`);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const TAG = `bell-qa-${STAMP.slice(-12)}`;

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

function parseBadge(t) {
  if (!t) return 0;
  if (t === "99+") return 99;
  const n = parseInt(String(t), 10);
  return Number.isFinite(n) ? n : 0;
}

async function appIconTotal(page) {
  return page.evaluate(async () => {
    const j = await fetch("/api/me/notifications/badge-count?fresh=1", {
      credentials: "include",
      cache: "no-store",
    }).then((r) => r.json());
    return j?.total ?? null;
  });
}

function bellSurfaceForPath(pathname) {
  const path = (pathname || "/").split("?")[0].split("#")[0];
  if (path.startsWith("/community-messenger")) return "bottom_nav_chat";
  if (path === "/philife" || path.startsWith("/philife/")) return "bottom_nav_community";
  if (path === "/market" || path.startsWith("/market/")) return "bottom_nav_my";
  if (path === "/stores" || path.startsWith("/stores/") || path.startsWith("/orders"))
    return "bottom_nav_delivery";
  return "tier1_inbox_bell";
}

async function bellUnreadForPage(page) {
  return page.evaluate(() => {
    const path = location.pathname;
    let surface = "tier1_inbox_bell";
    if (path.startsWith("/community-messenger")) surface = "bottom_nav_chat";
    else if (path === "/philife" || path.startsWith("/philife/")) surface = "bottom_nav_community";
    else if (path === "/market" || path.startsWith("/market/")) surface = "bottom_nav_my";
    else if (path === "/stores" || path.startsWith("/stores/") || path.startsWith("/orders"))
      surface = "bottom_nav_delivery";
    return fetch(`/api/me/notifications?unread_count_only=1&badge_surface=${surface}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => ({ surface, unread: j?.unread_count ?? null }));
  });
}

async function bellDomUnread(page) {
  return page.evaluate(() => {
    const btn = document.querySelector('button[aria-haspopup="dialog"][aria-label]');
    if (!btn) return null;
    const spans = [...btn.querySelectorAll("span")];
    for (const s of spans) {
      const t = s.textContent?.trim() ?? "";
      if (/^\d+$/.test(t) || t === "99+") return parseInt(t, 10) || 99;
    }
    return 0;
  });
}

async function waitDomBellIncrease(page, before, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const cur = await bellDomUnread(page);
    if ((cur ?? 0) >= (before ?? 0) + 1) return { ok: true, value: cur };
    await delay(400);
  }
  return { ok: false, value: await bellDomUnread(page) };
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

async function openBellModal(page) {
  const btn = page.getByRole("button", { name: /알림|Notifications/i }).first();
  await btn.click();
  await page.waitForSelector('[aria-modal="true"][aria-labelledby="philife-inbox-title"]', {
    timeout: 10000,
  });
  await delay(800);
}

async function closeBellModal(page) {
  const close = page.locator('[aria-labelledby="philife-inbox-title"]').getByRole("button", {
    name: /닫기|Close/i,
  });
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await delay(400);
  }
}

async function refreshInboxList(page) {
  await page.evaluate(async () => {
    await fetch("/api/me/notifications?exclude_owner_store_commerce=1&exclude_chat_message=1&limit=80", {
      credentials: "include",
      cache: "no-store",
    }).catch(() => null);
  });
}

async function waitInboxRow(page, title, ms = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const inModal = await page
      .locator('[aria-modal="true"]')
      .getByText(title, { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    if (inModal) return true;
    const modalOpen = await page
      .locator('[aria-modal="true"][aria-labelledby="philife-inbox-title"]')
      .isVisible()
      .catch(() => false);
    if (!modalOpen) await openBellModal(page);
    await delay(600);
    if (Date.now() - t0 > ms / 2) {
      await closeBellModal(page);
      await refreshInboxList(page);
      await delay(400);
      await openBellModal(page);
    }
  }
  return false;
}

async function clickInboxRow(page, title, destPattern) {
  const found = await waitInboxRow(page, title);
  if (!found) return { clicked: false, pathname: new URL(page.url()).pathname };
  const domBefore = await bellDomUnread(page);
  await page.locator('[aria-modal="true"]').getByText(title, { exact: false }).first().click();
  if (destPattern) {
    try {
      await page.waitForURL(destPattern, { timeout: 12000 });
    } catch {
      /* captured below */
    }
  } else {
    await delay(2500);
  }
  const domAfter = await bellDomUnread(page);
  return {
    clicked: true,
    pathname: new URL(page.url()).pathname,
    domBellBefore: domBefore,
    domBellAfter: domAfter,
    domBellDecreased: (domAfter ?? 999) < (domBefore ?? 0),
  };
}

async function waitBellIncrease(page, before, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const { unread: cur } = await bellUnreadForPage(page);
    if ((cur ?? 0) >= (before ?? 0) + 1) return { ok: true, value: cur };
    await delay(400);
  }
  const { unread: value } = await bellUnreadForPage(page);
  return { ok: false, value };
}

async function waitBellDecrease(page, before, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const { unread: cur } = await bellUnreadForPage(page);
    if ((cur ?? 999) < (before ?? 0)) return { ok: true, value: cur };
    await delay(400);
  }
  const { unread: value } = await bellUnreadForPage(page);
  return { ok: false, value };
}

function runSoundVitest() {
  const r = spawnSync(
    "npx",
    [
      "vitest",
      "run",
      "lib/notifications/__tests__/badge-source-eventkey-matrix.test.ts",
      "lib/notifications/__tests__/inbox-bell-p0.test.ts",
    ],
    { cwd: ROOT, encoding: "utf8", stdio: "pipe" }
  );
  return { pass: r.status === 0, status: r.status, tail: (r.stdout ?? "").slice(-600) };
}

async function main() {
  loadEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const report = {
    measuredAt: new Date().toISOString(),
    baseUrl: BASE,
    harnessRevision: "2026-07-08-bell-modal-runtime-qa-v1",
    checks: {},
    fixtures: {},
    pass: false,
    commitable: false,
  };

  const sound = runSoundVitest();
  report.checks.sound_eventkey_matrix = {
    pass: sound.pass,
    vitestStatus: sound.status,
  };

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

  const postRow = await sb
    .from("community_posts")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const { data: productRows } = await sb.from("posts").select("id").limit(1);
  const orderRow = await sb
    .from("store_orders")
    .select("id, buyer_user_id, order_status")
    .eq("buyer_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  report.fixtures = {
    postId: postRow.data?.id ?? null,
    productId: productRows?.[0]?.id ?? null,
    orderId: orderRow.data?.id ?? null,
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  let runError = null;
  try {
    // 1) Modal opens (tier1 all-kinds surface on /mypage)
    await page.goto(`${BASE}/mypage`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(2500);
    const bellBeforeOpen = (await bellUnreadForPage(page)).unread;
    await openBellModal(page);
    const modalVisible = await page
      .locator('[aria-modal="true"][aria-labelledby="philife-inbox-title"]')
      .isVisible();
    report.checks.modal_opens = {
      pass: modalVisible,
      path: "/mypage",
      surface: bellSurfaceForPath("/mypage"),
      bellBefore: bellBeforeOpen,
      domBellBefore: await bellDomUnread(page),
    };
    await closeBellModal(page);

    // 2) Community click on /philife
    let communityPass = false;
    let communityReason = "no_post_fixture";
    if (postRow.data?.id) {
      const postId = postRow.data.id;
      const title = `${TAG}-community`;
      const evId = await insertEvent(sb, userId, {
        type: "community_activity",
        category: "community_activity",
        title,
        body: "qa",
        dedupe_key: `bell-qa:community:${Date.now()}`,
        display_payload: {
          routeUrl: `/philife/${postId}`,
          legacyMeta: { post_id: postId },
          legacyPushKind: "community",
        },
      });
      cleanup.push(evId);
      await page.goto(`${BASE}/philife`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await delay(2000);
      const domBellMid = await bellDomUnread(page);
      const inc = await waitDomBellIncrease(page, domBellMid);
      const appBefore = await appIconTotal(page);
      await openBellModal(page);
      const click = await clickInboxRow(page, title, new RegExp(`/philife/${postId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
      const appAfter = await appIconTotal(page);
      const postStill = await sb.from("community_posts").select("id").eq("id", postId).maybeSingle();
      communityPass =
        click.clicked &&
        click.pathname === `/philife/${postId}` &&
        (appAfter ?? 999) < appBefore &&
        !!postStill.data?.id;
      communityReason = communityPass
        ? null
        : `clicked=${click.clicked} inc=${inc.ok} path=${click.pathname} dom=${click.domBellBefore}->${click.domBellAfter} app=${appBefore}->${appAfter}`;
      report.checks.community_click_clear = {
        pass: communityPass,
        postId,
        title,
        pathname: click.pathname,
        domBellBefore: click.domBellBefore ?? domBellMid,
        domBellAfter: click.domBellAfter,
        appBefore,
        appAfter,
        postExists: !!postStill.data?.id,
        reason: communityReason,
      };
    } else {
      report.checks.community_click_clear = { pass: false, reason: communityReason };
    }

    // 3) Trade click on /market
    let tradePass = false;
    let tradeReason = "no_product_fixture";
    const productId = report.fixtures.productId;
    if (productId) {
      const title = `${TAG}-trade`;
      const evId = await insertEvent(sb, userId, {
        type: "trade_status",
        category: "trade_status",
        title,
        body: "qa",
        dedupe_key: `bell-qa:trade:${Date.now()}`,
        display_payload: {
          routeUrl: `/post/${productId}`,
          legacyMeta: { product_id: productId },
          legacyPushKind: "trade",
        },
      });
      cleanup.push(evId);
      await page.goto(`${BASE}/market`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await delay(2000);
      const domBellMid = await bellDomUnread(page);
      const inc = await waitDomBellIncrease(page, domBellMid);
      const appBefore = await appIconTotal(page);
      await openBellModal(page);
      const click = await clickInboxRow(
        page,
        title,
        new RegExp(`/post/${productId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|/community-messenger`)
      );
      const appAfter = await appIconTotal(page);
      const productStill = await sb.from("posts").select("id").eq("id", productId).maybeSingle();
      const tradeDestOk =
        click.pathname === `/post/${productId}` || click.pathname.includes("/community-messenger");
      tradePass =
        click.clicked &&
        tradeDestOk &&
        (appAfter ?? 999) < appBefore &&
        !!productStill.data?.id;
      tradeReason = tradePass
        ? null
        : `clicked=${click.clicked} inc=${inc.ok} path=${click.pathname} dom=${click.domBellBefore}->${click.domBellAfter} app=${appBefore}->${appAfter}`;
      report.checks.trade_click_clear = {
        pass: tradePass,
        productId,
        title,
        pathname: click.pathname,
        domBellBefore: click.domBellBefore ?? domBellMid,
        domBellAfter: click.domBellAfter,
        appBefore,
        appAfter,
        productExists: !!productStill.data?.id,
        reason: tradeReason,
      };
    } else {
      report.checks.trade_click_clear = { pass: false, reason: tradeReason };
    }

    // 4) Delivery click on /stores
    let deliveryPass = false;
    let deliveryReason = "no_buyer_order_fixture";
    if (orderRow.data?.id) {
      const orderId = orderRow.data.id;
      const title = `${TAG}-delivery`;
      const evId = await insertEvent(sb, userId, {
        type: "order_status",
        category: "order_status",
        title,
        body: "qa",
        dedupe_key: `bell-qa:delivery:${Date.now()}`,
        display_payload: {
          routeUrl: `/mypage/store-orders/${orderId}`,
          legacyRefId: orderId,
          legacyMeta: { order_id: orderId },
          legacyPushKind: "delivery",
        },
      });
      cleanup.push(evId);
      await page.goto(`${BASE}/stores`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await delay(2000);
      const domBellMid = await bellDomUnread(page);
      const inc = await waitDomBellIncrease(page, domBellMid);
      const appBefore = await appIconTotal(page);
      await openBellModal(page);
      const click = await clickInboxRow(
        page,
        title,
        new RegExp(`/mypage/store-orders/${orderId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
      );
      const appAfter = await appIconTotal(page);
      const orderStill = await sb.from("store_orders").select("id").eq("id", orderId).maybeSingle();
      deliveryPass =
        click.clicked &&
        click.pathname === `/mypage/store-orders/${orderId}` &&
        (appAfter ?? 999) < appBefore &&
        !!orderStill.data?.id;
      deliveryReason = deliveryPass
        ? null
        : `clicked=${click.clicked} inc=${inc.ok} path=${click.pathname} dom=${click.domBellBefore}->${click.domBellAfter} app=${appBefore}->${appAfter}`;
      report.checks.delivery_click_clear = {
        pass: deliveryPass,
        orderId,
        title,
        pathname: click.pathname,
        domBellBefore: click.domBellBefore ?? domBellMid,
        domBellAfter: click.domBellAfter,
        appBefore,
        appAfter,
        orderExists: !!orderStill.data?.id,
        reason: deliveryReason,
      };
    } else {
      report.checks.delivery_click_clear = { pass: false, reason: deliveryReason };
    }

    // 5) Mark all read on /mypage (tier1 all kinds)
    const seedIds = [];
    if (postRow.data?.id) {
      seedIds.push(
        await insertEvent(sb, userId, {
          type: "community_activity",
          category: "community_activity",
          title: `${TAG}-markall-c`,
          body: "qa",
          dedupe_key: `bell-qa:markall-c:${Date.now()}`,
          display_payload: {
            legacyMeta: { post_id: postRow.data.id },
            legacyPushKind: "community",
          },
        })
      );
    }
    if (productId) {
      seedIds.push(
        await insertEvent(sb, userId, {
          type: "trade_status",
          category: "trade_status",
          title: `${TAG}-markall-t`,
          body: "qa",
          dedupe_key: `bell-qa:markall-t:${Date.now()}`,
          display_payload: {
            legacyMeta: { product_id: productId },
            legacyPushKind: "trade",
          },
        })
      );
    }
    cleanup.push(...seedIds);
    await page.goto(`${BASE}/mypage`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(2500);
    const domBeforeMarkAll = await bellDomUnread(page);
    await waitDomBellIncrease(page, domBeforeMarkAll);
    await openBellModal(page);
    const markBtn = page.getByRole("button", { name: /모두 읽음|Mark all read/i });
    await markBtn.click();
    await delay(3500);
    const domAfterMarkAll = await bellDomUnread(page);
    const apiAfterMarkAll = (await bellUnreadForPage(page)).unread;
    const adminNoticeAfter = await page.evaluate(async () => {
      const j = await fetch("/api/me/notifications/badge-count?fresh=1", {
        credentials: "include",
        cache: "no-store",
      }).then((r) => r.json());
      return j?.adminNotice ?? j?.admin_notice ?? null;
    });
    await closeBellModal(page);
    const originalsOk =
      (!postRow.data?.id ||
        !!(await sb.from("community_posts").select("id").eq("id", postRow.data.id).maybeSingle()).data
          ?.id) &&
      (!productId ||
        !!(await sb.from("posts").select("id").eq("id", productId).maybeSingle()).data?.id) &&
      (!orderRow.data?.id ||
        !!(await sb.from("store_orders").select("id").eq("id", orderRow.data.id).maybeSingle()).data
          ?.id);
    report.checks.mark_all_read_bell_zero = {
      pass: domAfterMarkAll === 0 && apiAfterMarkAll === 0 && adminNoticeAfter === 0 && originalsOk,
      domBellBefore: domBeforeMarkAll,
      domBellAfter: domAfterMarkAll,
      apiBellAfter: apiAfterMarkAll,
      adminNoticeAfter,
      originalsOk,
    };

    // 6) Delete — remove from inbox, no reappear, original preserved
    try {
    let deletePass = false;
    let deleteReason = "no_post_fixture";
    if (postRow.data?.id) {
      const postId = postRow.data.id;
      const title = `${TAG}-delete`;
      const evId = await insertEvent(sb, userId, {
        type: "community_activity",
        category: "community_activity",
        title,
        body: "qa",
        dedupe_key: `bell-qa:delete:${Date.now()}`,
        display_payload: {
          legacyMeta: { post_id: postId },
          legacyPushKind: "community",
        },
      });
      cleanup.push(evId);
      await page.goto(`${BASE}/mypage`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await delay(2500);
      await openBellModal(page);
      const rowFound = await waitInboxRow(page, title);
      const row = page.locator('[aria-modal="true"]').getByText(title, { exact: false }).first();
      const rowVisible = rowFound && (await row.isVisible().catch(() => false));
      const deleteBtn = row
        .locator("xpath=ancestor::li[1]")
        .getByRole("button", { name: /이 알림 삭제|Delete this notification/i });
      await deleteBtn.click();
      await page
        .locator('[role=alertdialog]')
        .getByRole("button", { name: /^삭제$|^Delete$/i })
        .click({ force: true });
      await delay(2500);
      const goneAfterDelete = !(await row.isVisible().catch(() => false));
      await closeBellModal(page);
      await openBellModal(page);
      const goneAfterReopen = !(await page.getByText(title, { exact: false }).isVisible().catch(() => false));
      const postStill = await sb.from("community_posts").select("id").eq("id", postId).maybeSingle();
      const evStill = await sb.from("notification_events").select("id, dismissed_at").eq("id", evId).maybeSingle();
      deletePass = rowVisible && goneAfterDelete && goneAfterReopen && !!postStill.data?.id;
      deleteReason = deletePass
        ? null
        : `row=${rowVisible} gone=${goneAfterDelete} reopen=${goneAfterReopen} post=${!!postStill.data?.id} ev=${!!evStill.data}`;
      report.checks.delete_no_reappear_original_kept = {
        pass: deletePass,
        title,
        postId,
        postExists: !!postStill.data?.id,
        eventRow: evStill.data ?? null,
        reason: deleteReason,
      };
    } else {
      report.checks.delete_no_reappear_original_kept = { pass: false, reason: deleteReason };
    }
    } catch (e) {
      report.checks.delete_no_reappear_original_kept = {
        pass: false,
        reason: String(e?.message ?? e),
      };
    }

    // 7) App icon decrease (aggregate from click tests)
    const clickTests = [
      report.checks.community_click_clear,
      report.checks.trade_click_clear,
      report.checks.delivery_click_clear,
    ].filter(Boolean);
    const appDecreasedOnClicks = clickTests.every(
      (c) => c.pass || (c.appBefore != null && c.appAfter != null && c.appAfter < c.appBefore)
    );
    report.checks.app_icon_decrease_on_clicks = {
      pass: clickTests.length > 0 && clickTests.every((c) => c.appAfter < c.appBefore),
      details: clickTests.map((c) => ({
        key: c.title ?? c.orderId ?? c.productId,
        appBefore: c.appBefore,
        appAfter: c.appAfter,
        pass: c.appAfter < c.appBefore,
      })),
    };

    report.pass =
      report.checks.modal_opens.pass &&
      report.checks.community_click_clear.pass &&
      report.checks.trade_click_clear.pass &&
      report.checks.delivery_click_clear.pass &&
      report.checks.mark_all_read_bell_zero.pass &&
      report.checks.delete_no_reappear_original_kept.pass &&
      report.checks.app_icon_decrease_on_clicks.pass &&
      report.checks.sound_eventkey_matrix.pass;

    await page.screenshot({ path: path.join(OUT, "final-philife.png"), fullPage: false }).catch(() => {});
    await browser.close().catch(() => {});
  } catch (e) {
    runError = String(e?.message ?? e);
    report.runError = runError;
    await browser.close().catch(() => {});
  } finally {
    if (cleanup.length) {
      try {
        await sb.from("notification_events").delete().in("id", cleanup);
      } catch {
        /* best-effort */
      }
    }
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  }

  console.log(JSON.stringify(report, null, 2));
  console.log(`\n[bell-modal-runtime-qa] report=${path.join(OUT, "report.json")}`);
  process.exit(report.pass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
