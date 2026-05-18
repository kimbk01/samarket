/**
 * R2-D1 real-event verification — owner orders row-patch (read-only measurement).
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 node scripts/perf/r2-d1-real-event-verify.mjs
 *
 * Env:
 *   E2E_OWNER_USERNAME (default aa11)
 *   E2E_OWNER_PASSWORD (default 1234)
 *   E2E_BUYER_USERNAME (default aaaa)
 *   E2E_BUYER_PASSWORD (default 1234)
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const origin = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ownerUser =
  process.env.E2E_OWNER_USERNAME?.trim() ||
  process.env.E2E_TEST_USERNAME?.trim() ||
  "aa11";
const ownerPass =
  process.env.E2E_OWNER_PASSWORD ?? process.env.E2E_TEST_PASSWORD ?? "1234";
const buyerUser = process.env.E2E_BUYER_USERNAME?.trim() || "aaaa";
const buyerPass = process.env.E2E_BUYER_PASSWORD ?? "1234";
const outPath = process.env.R2D1_VERIFY_OUT ?? "messenger-r2-d1-verify.log";

async function login(page, user, pass) {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const email = page.getByPlaceholder("이메일 또는 로그인 ID");
  await email.waitFor({ state: "visible", timeout: 30_000 });
  await email.fill(user);
  const pw = page.locator('input[type="password"]');
  await pw.fill(pass);
  const submit = page.getByRole("button", { name: /^로그인$/ });
  await submit.waitFor({ state: "visible", timeout: 30_000 });
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 120_000,
      waitUntil: "domcontentloaded",
    }),
    submit.click(),
  ]);
}

function parseDibayLine(text) {
  const m = text.match(/\[dibay-r2d1\]\s+(\S+)\s+(\{[\s\S]*\})/);
  if (!m) return null;
  try {
    return { kind: m[1], data: JSON.parse(m[2]) };
  } catch {
    return { kind: m[1], raw: m[2] };
  }
}

function summarizeLogs(lines) {
  const counts = {};
  const events = [];
  for (const line of lines) {
    const p = parseDibayLine(line);
    if (!p) continue;
    counts[p.kind] = (counts[p.kind] ?? 0) + 1;
    events.push({ kind: p.kind, ...(p.data ?? {}) });
  }
  return { counts, events };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const dibayLines = [];
  const orderListFetches = [];
  const timeline = [];

  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ownerCtx.addInitScript(() => {
    try {
      sessionStorage.setItem("dibay:r2d1:trace", "1");
    } catch {
      /* ignore */
    }
  });
  const ownerPage = await ownerCtx.newPage();
  ownerPage.on("dialog", (d) => d.accept().catch(() => undefined));
  ownerPage.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("[dibay-r2d1]")) dibayLines.push(t);
  });
  ownerPage.on("request", (req) => {
    const u = req.url();
    if (/\/api\/me\/stores\/[^/]+\/orders(?:\?|$)/.test(u)) {
      orderListFetches.push({ at: Date.now(), url: u });
    }
  });

  const result = {
    captured_at: new Date().toISOString(),
    origin,
    owner: ownerUser,
    buyer: buyerUser,
    store_name: null,
    store_id: null,
    order_id: null,
    order_created_at: null,
    delivery_patches: [],
    errors: [],
    order_list_fetch_timeline: orderListFetches,
  };

  try {
    timeline.push({ step: "owner_login", at: Date.now() });
    await login(ownerPage, ownerUser, ownerPass);
    await ownerPage.goto(`${origin}/stores/owner/orders`, { waitUntil: "domcontentloaded" });
    await ownerPage.waitForFunction(
      () => {
        const t = document.body?.innerText ?? "";
        return t.includes("신규 주문") || t.includes("아직 주문이 없습니다");
      },
      { timeout: 60_000 }
    );
    timeline.push({ step: "owner_dashboard_ready", at: Date.now() });

    const storesRes = await ownerPage.request.get(`${origin}/api/me/stores`);
    const storesJson = await storesRes.json().catch(() => ({}));
    const store = storesJson?.stores?.[0];
    if (!store?.id) throw new Error("owner_store_not_found");
    result.store_id = store.id;
    result.store_name = store.store_name ?? null;
    const storeId = store.id;

    const productsRes = await ownerPage.request.get(
      `${origin}/api/me/stores/${encodeURIComponent(storeId)}/products`
    );
    const productsJson = await productsRes.json().catch(() => ({}));
    const product =
      (productsJson?.products ?? productsJson?.items ?? []).find(
        (p) => p?.product_status === "active" || p?.status === "active"
      ) ?? (productsJson?.products ?? [])[0];
    if (!product?.id) throw new Error("no_active_product");

    const buyerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const buyerPage = await buyerCtx.newPage();
    await login(buyerPage, buyerUser, buyerPass);

    const clientKey = `r2d1-verify-${Date.now()}`;
    const qty = Math.max(1, Number(product.min_order_qty) || 1);
    const fetchBeforeOrder = orderListFetches.length;
    timeline.push({ step: "buyer_create_order", at: Date.now() });
    const orderCreate = await buyerPage.evaluate(
      async ({ origin, storeId, productId, qty, clientKey }) => {
        const addrRes = await fetch(`${origin}/api/me/addresses`, { credentials: "include" });
        const addrJson = await addrRes.json().catch(() => ({}));
        const savedAddr = addrJson?.addresses?.[0] ?? null;
        if (!savedAddr?.id) {
          return { ok: false, status: addrRes.status, error: "buyer_address_missing" };
        }
        const addrSummary =
          String(savedAddr.formattedAddress ?? savedAddr.formatted_address ?? savedAddr.fullAddress ?? "").trim() ||
          "684-718, 1001 Paterno St, Quiapo, Manila";
        const addrDetail = String(savedAddr.detailAddress ?? savedAddr.detail_address ?? "").trim() || "R2-D1";
        const orderRes = await fetch(`${origin}/api/me/store-orders`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_id: storeId,
            fulfillment_type: "local_delivery",
            payment_method: "cod",
            buyer_phone: "09171234567",
            client_order_key: clientKey,
            delivery_user_address_id: savedAddr.id,
            delivery_address_summary: addrSummary,
            delivery_address_detail: addrDetail,
            delivery_region: "Metro Manila",
            delivery_city: "Manila",
            items: [{ product_id: productId, qty }],
          }),
        });
        const orderJson = await orderRes.json().catch(() => ({}));
        return { ok: orderRes.ok, status: orderRes.status, orderJson };
      },
      { origin, storeId, productId: product.id, qty, clientKey }
    );
    if (!orderCreate.ok || !orderCreate.orderJson?.order?.id) {
      throw new Error(
        `order_create_failed:${orderCreate.status}:${JSON.stringify(orderCreate.orderJson ?? orderCreate).slice(0, 200)}`
      );
    }
    result.order_id = orderCreate.orderJson.order.id;
    result.order_created_at = new Date().toISOString();
    await ownerPage.waitForTimeout(6_000);
    const fetchAfterOrder = orderListFetches.length;

    const ownerApi = ownerPage.request;
    const oid = result.order_id;
    const statusPath = `${origin}/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(oid)}`;

    const transitions = [
      { order_status: "accepted", estimated_prep_minutes: 15 },
      { order_status: "preparing" },
      { order_status: "ready_for_pickup" },
      { order_status: "delivering" },
    ];
    for (const body of transitions) {
      timeline.push({ step: `order_status_${body.order_status}`, at: Date.now() });
      const f0 = orderListFetches.length;
      await ownerApi.patch(statusPath, { data: body });
      await ownerPage.waitForTimeout(2_500);
      result.delivery_patches.push({
        kind: "order_status",
        status: body.order_status,
        list_fetches_delta: orderListFetches.length - f0,
      });
    }

    const deliveryPath = `${statusPath}/delivery`;
    const deliverySteps = ["rider_assigned", "pickup_in_progress", "delivering", "delivered"];
    for (const set_delivery_status of deliverySteps) {
      timeline.push({ step: `delivery_${set_delivery_status}`, at: Date.now() });
      const f0 = orderListFetches.length;
      const dRes = await ownerApi.patch(deliveryPath, { data: { set_delivery_status } });
      const dJson = await dRes.json().catch(() => ({}));
      await ownerPage.waitForTimeout(2_500);
      result.delivery_patches.push({
        kind: "delivery_status",
        status: set_delivery_status,
        ok: dRes.ok(),
        list_fetches_delta: orderListFetches.length - f0,
        error: dJson?.error,
      });
    }

    await ownerPage.waitForTimeout(3_000);
    await buyerCtx.close();

    const { counts, events } = summarizeLogs(dibayLines);
    result.dibay_counts = counts;
    result.dibay_events = events;
    result.list_fetches_after_order_create = fetchAfterOrder - fetchBeforeOrder;
    result.timeline = timeline;

    const badReload =
      (counts.delivery_reload ?? 0) > 0 ||
      events.some((e) => e.fetchReason === "realtime_deliveries") ||
      events.some((e) => e.fetchReason === "realtime_store_orders");

    const hasOrderPatch =
      (counts.row_patch_insert ?? 0) > 0 ||
      (counts.row_patch_update ?? 0) > 0 ||
      (counts.full_reload_blocked ?? 0) > 0;

    const hasDeliveryPatch =
      (counts.delivery_row_patch_insert ?? 0) > 0 ||
      (counts.delivery_row_patch_update ?? 0) > 0 ||
      (counts.delivery_full_reload_blocked ?? 0) > 0;

    const rtListFetchOnEvent = result.delivery_patches.some((p) => p.list_fetches_delta > 0);

    result.verdict =
      hasOrderPatch && hasDeliveryPatch && !badReload && !rtListFetchOnEvent ? "PASS" : "FAIL";
    result.checks = {
      hasOrderPatch,
      hasDeliveryPatch,
      badReload,
      rtListFetchOnEvent,
      listener_attach: (counts.listener_attach ?? 0) > 0,
    };
  } catch (e) {
    result.verdict = "FAIL";
    result.errors.push(e instanceof Error ? e.message : String(e));
    result.dibay_counts = summarizeLogs(dibayLines).counts;
  } finally {
    await ownerCtx.close();
    await browser.close();
  }

  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ verdict: result.verdict, counts: result.dibay_counts, order_id: result.order_id }));
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
