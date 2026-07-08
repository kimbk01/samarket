#!/usr/bin/env node
/**
 * Delivery clear audit — buyer-owned order only.
 * No Food/Stores BottomNav DOM assertions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { buildApkSessionCookies } from "../scripts/qa/lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.SSOT_AUDIT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/delivery-clear-audit/${STAMP}`);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function badgeFresh(page) {
  return page.evaluate(async () => {
    const j = await fetch("/api/me/notifications/badge-count?fresh=1", {
      credentials: "include",
      cache: "no-store",
    }).then((r) => r.json());
    return j;
  });
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

async function orderEventsState(sb, userId, orderId) {
  const { data } = await sb
    .from("notification_events")
    .select("id, unread, read_at, category, display_payload")
    .eq("user_id", userId)
    .in("category", ["order_status", "delivery_status"])
    .or(
      `display_payload->legacyMeta->>order_id.eq.${orderId},display_payload->>legacyRefId.eq.${orderId}`
    )
    .order("delivered_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

async function orderTargetsState(sb, userId, orderId) {
  const { data } = await sb
    .from("notification_targets")
    .select("target_type, target_id, is_unread, scope, updated_at")
    .eq("user_id", userId)
    .eq("target_id", orderId);
  return data ?? [];
}

async function main() {
  loadEnv();
  fs.mkdirSync(OUT, { recursive: true });
  const report = {
    measuredAt: new Date().toISOString(),
    baseUrl: BASE,
    buyerOrderId: null,
    detailPage: {},
    readThread: {},
    orderStatus: { before: null, mid: null, after: null },
    deliveryTargets: { before: [], after: [] },
    notificationEvents: { before: [], after: [], insertedEventId: null },
    appIconTotal: { before: null, mid: null, after: null },
    productFixNeeded: null,
    pass: false,
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

  const { data: orderRow } = await sb
    .from("store_orders")
    .select("id, buyer_user_id, order_status")
    .eq("buyer_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!orderRow?.id) {
    report.productFixNeeded = "no_buyer_order_fixture";
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const orderId = orderRow.id;
  report.buyerOrderId = orderId;
  report.buyerOrderStatus = orderRow.order_status;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  const readThreadCalls = [];
  page.on("request", (req) => {
    if (req.method() !== "POST" || !req.url().includes("/api/me/notifications/read-thread")) return;
    let body = {};
    try {
      body = req.postDataJSON?.() ?? {};
    } catch {
      body = { parseError: true };
    }
    readThreadCalls.push({ url: req.url(), body, t: Date.now() });
  });
  const readThreadResponses = [];
  page.on("response", async (res) => {
    if (res.request().method() !== "POST" || !res.url().includes("/api/me/notifications/read-thread"))
      return;
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = { parseError: true };
    }
    readThreadResponses.push({
      status: res.status(),
      ok: res.ok(),
      json,
      t: Date.now(),
    });
  });

  let insertedId = null;
  try {
    await page.goto(`${BASE}/market`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(2000);

    const beforeBadge = await badgeFresh(page);
    report.appIconTotal.before = beforeBadge?.total ?? null;
    report.orderStatus.before = beforeBadge?.orderStatus ?? null;
    report.notificationEvents.before = await orderEventsState(sb, userId, orderId);
    report.deliveryTargets.before = await orderTargetsState(sb, userId, orderId);

    insertedId = await insertEvent(sb, userId, {
      type: "order_status",
      category: "order_status",
      title: "delivery-clear-audit",
      body: "audit",
      dedupe_key: `delivery-clear-audit:${orderId}:${Date.now()}`,
      display_payload: {
        routeUrl: `/mypage/store-orders/${orderId}`,
        legacyRefId: orderId,
        legacyMeta: { order_id: orderId },
      },
    });
    report.notificationEvents.insertedEventId = insertedId;

    const t0 = Date.now();
    let midBadge = beforeBadge;
    while (Date.now() - t0 < 15000) {
      midBadge = await badgeFresh(page);
      if ((midBadge?.orderStatus ?? 0) >= (report.orderStatus.before ?? 0) + 1) break;
      await delay(400);
    }
    report.appIconTotal.mid = midBadge?.total ?? null;
    report.orderStatus.mid = midBadge?.orderStatus ?? null;

    const detailUrl = `${BASE}/mypage/store-orders/${encodeURIComponent(orderId)}`;
    await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await delay(5000);

    const detailProbe = await page.evaluate(() => {
      const text = document.body?.innerText ?? "";
      const hasError =
        text.includes("network_error") ||
        text.includes("mypage_comp_network_error") ||
        /not.?found/i.test(text);
      const hasOrderUi =
        Boolean(document.querySelector("[data-store-order-detail]")) ||
        text.length > 200;
      return {
        pathname: location.pathname,
        hasOrderUi,
        hasError,
        titleSnippet: text.slice(0, 300),
      };
    });
    report.detailPage = {
      url: detailUrl,
      ...detailProbe,
      myStoreOrderDetailViewMountCandidate:
        detailProbe.pathname.includes(orderId) && detailProbe.hasOrderUi && !detailProbe.hasError,
    };

    await delay(3000);
    const afterBadge = await badgeFresh(page);
    report.appIconTotal.after = afterBadge?.total ?? null;
    report.orderStatus.after = afterBadge?.orderStatus ?? null;
    report.notificationEvents.after = await orderEventsState(sb, userId, orderId);
    report.deliveryTargets.after = await orderTargetsState(sb, userId, orderId);

    const orderReadCalls = readThreadCalls.filter(
      (c) =>
        c.body?.readReason === "order_detail_opened" &&
        String(c.body?.threadId ?? c.body?.roomId ?? "") === String(orderId)
    );
    report.readThread = {
      called: orderReadCalls.length > 0,
      callCount: orderReadCalls.length,
      calls: orderReadCalls,
      responses: readThreadResponses,
      responseOk: readThreadResponses.some((r) => r.ok && r.json?.ok !== false),
      responseBodies: readThreadResponses.map((r) => r.json),
    };

    const insertedAfter = report.notificationEvents.after.find((e) => e.id === insertedId);
    report.insertedEventRead = insertedAfter
      ? { unread: insertedAfter.unread, read_at: insertedAfter.read_at }
      : null;

    const orderStatusIncreased =
      (report.orderStatus.mid ?? 0) >= (report.orderStatus.before ?? 0) + 1;
    const orderStatusCleared =
      (report.orderStatus.after ?? 999) <= (report.orderStatus.before ?? 0);
    const appIconDecreased =
      (report.appIconTotal.after ?? 999) < (report.appIconTotal.mid ?? 0);
    const targetsCleared =
      report.deliveryTargets.after.every((t) => t.is_unread === false) ||
      report.deliveryTargets.after.length === 0;

    report.pass =
      orderStatusIncreased &&
      report.detailPage.myStoreOrderDetailViewMountCandidate &&
      report.readThread.called &&
      report.readThread.responseOk &&
      insertedAfter?.read_at != null &&
      orderStatusCleared &&
      appIconDecreased;

    if (!report.pass) {
      const gaps = [];
      if (!orderStatusIncreased) gaps.push("orderStatus_did_not_increase_after_insert");
      if (!report.detailPage.myStoreOrderDetailViewMountCandidate)
        gaps.push("detail_page_not_ok_or_not_found");
      if (!report.readThread.called) gaps.push("read_thread_order_detail_opened_not_called");
      if (!report.readThread.responseOk) gaps.push("read_thread_response_not_ok");
      if (!insertedAfter?.read_at) gaps.push("inserted_event_read_at_not_set");
      if (!orderStatusCleared) gaps.push("orderStatus_not_cleared_after_detail");
      if (!appIconDecreased) gaps.push("app_icon_total_not_decreased");
      report.failureGaps = gaps;
      report.productFixNeeded = gaps.some((g) =>
        [
          "read_thread_order_detail_opened_not_called",
          "read_thread_response_not_ok",
          "inserted_event_read_at_not_set",
          "orderStatus_not_cleared_after_detail",
          "detail_page_not_ok_or_not_found",
        ].includes(g)
      );
    } else {
      report.productFixNeeded = false;
    }

    await page.screenshot({ path: path.join(OUT, "order-detail.png"), fullPage: false });
    await browser.close();
  } finally {
    if (insertedId) {
      try {
        await sb.from("notification_events").delete().eq("id", insertedId);
      } catch {
        /* cleanup best-effort */
      }
    }
  }

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n[delivery-clear-audit] report=${path.join(OUT, "report.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
