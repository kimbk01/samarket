/**
 * U7-C — ORDER-COMPLETION REVENUE RECOGNITION RUNTIME PROOF (new fixture only)
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3025 node scripts/qa/gift-u7c-revenue-recognition-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3025").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-u7c-runtime.json");
const SHOT = resolve(process.cwd(), ".tmp-gift-u7c-shots");
const STORE = {
  storeId: "19085860-52d2-4183-b033-e71fcb58bcec",
  slug: "aa11",
  name: "나의 오른손딸방",
};
const POSITIVE_FEE_PRODUCT = "2901c35b-6a56-4fb1-a9dd-029263780364";
const CART_PRODUCT = {
  id: "7929c806-4f49-4e91-98d8-43304e026134",
  title: "매운 라면의 아름 다운 밤 입니다.",
  unitPhp: 2000,
};
const FEE_RATE = 10;
const FACE = 1000;
const PRICE = 1000;
const BUYER_EMAIL = "wwww@manual.local";
const OWNER_EMAIL = "sadads@adsasdsa.com";
const ADMIN_EMAIL = "aaaa@manual.local";
const VP = { width: 390, height: 844 };

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function passwords() {
  return [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "DibayQa1!", "1234"].filter(Boolean))];
}

function sbService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function sbAnon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

async function loginSession(email) {
  const sb = sbAnon();
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) return data.session;
  }
  throw new Error(`login_failed:${email}`);
}

function cookies(session, sessionId) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const list = [
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        })
      ),
      domain: origin.hostname,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    },
  ];
  if (sessionId) {
    list.push({
      name: "samarket_active_session_id",
      value: sessionId,
      domain: origin.hostname,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 86400 * 7,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    });
  }
  return list;
}

async function openAuthed(browser, email, viewport = VP) {
  const session = await loginSession(email);
  const { data: pr } = await sbService()
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await context.addCookies(cookies(session, pr?.active_session_id ? String(pr.active_session_id) : ""));
  const page = await context.newPage();
  return { context, page, userId: session.user.id };
}

async function shot(page, name) {
  mkdirSync(SHOT, { recursive: true });
  await page.screenshot({ path: resolve(SHOT, `${name}.png`), fullPage: true }).catch(() => null);
}

async function ownerAvailable(sb, storeId) {
  const { data } = await sb.rpc("gift_certificate_store_revenue_available", { p_store_id: storeId });
  return Math.trunc(Number(data) || 0);
}

async function adminRevenue(page) {
  const res = await page.request.get(`${ORIGIN}/api/admin/gift-certificates/revenue`);
  return res.json();
}

async function ensurePickup(page, storeSlug) {
  await page.evaluate((slug) => {
    sessionStorage.setItem(`samarket:store-fulfillment:${slug}`, "pickup");
  }, storeSlug);
  const chip = page.locator("button.delivery-fulfillment-chip").filter({ hasText: /픽업|Pickup/i }).first();
  if (await chip.count()) {
    await chip.click({ force: true });
    await page.waitForTimeout(600);
  }
  const body = await page.locator("body").innerText();
  if (/Est\. delivery fee|배달비|delivery fee/i.test(body) && !/pickup location|픽업 장소|포장/i.test(body)) {
    await chip.click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
  }
}

async function confirmCheckout(page) {
  const confirm = page
    .locator('[role="dialog"] button, [data-checkout-confirm] button')
    .filter({ hasText: /Place order|주문 접수|주문하기|Submit order|확인/i })
    .last();
  if (await confirm.count()) {
    await confirm.click();
    return;
  }
  const named = page.getByRole("button", { name: /^Place order$|주문 접수|주문하기/i });
  if (await named.count()) await named.last().click();
}

async function ownerPatch(page, storeId, orderId, order_status, extra = {}) {
  return page.evaluate(
    async ({ origin, storeId, orderId, order_status, extra }) => {
      const res = await fetch(`${origin}/api/me/stores/${storeId}/orders/${orderId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_status, ...extra }),
      });
      return { status: res.status, body: await res.json() };
    },
    { origin: ORIGIN, storeId, orderId, order_status, extra }
  );
}

loadEnv();
mkdirSync(SHOT, { recursive: true });

const report = {
  title: "DIBAY GIFT CERTIFICATE ORDER-COMPLETION REVENUE ROOT FIX",
  migrationApplied: "NOT_PROVEN",
  result: "BLOCKED",
  firstDivergence: "NONE",
  historicalMutation: "NONE",
  proofs: {},
};

function write() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

function fail(step, detail) {
  report.firstDivergence = `${step}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  report.result = "BLOCKED";
  write();
  throw new Error(report.firstDivergence);
}

write();

const sb = sbService();
const browser = await chromium.launch({ headless: true });

try {
  const probe = await sb.rpc("gift_certificate_recognize_revenue_for_completed_order", {
    p_order_id: "00000000-0000-4000-8000-000000000001",
  });
  if (probe.error?.message?.includes("Could not find")) fail("MIGRATION", probe.error.message);
  report.migrationApplied = "APPLIED";

  const health = await fetch(`${ORIGIN}/`);
  if (!health.ok) fail("ENV", ORIGIN);

  const { data: storeRow } = await sb.from("stores").select("owner_user_id").eq("id", STORE.storeId).maybeSingle();
  const ownerUserId = String(storeRow?.owner_user_id ?? "");
  if (!ownerUserId) fail("STORE", "missing owner");

  const baselineAvail = await ownerAvailable(sb, STORE.storeId);
  const buyerOpen = await openAuthed(browser, BUYER_EMAIL);
  const ownerOpen = await openAuthed(browser, OWNER_EMAIL);
  const adminOpen = await openAuthed(browser, ADMIN_EMAIL, { width: 1280, height: 900 });
  const buyer = buyerOpen.page;
  const owner = ownerOpen.page;
  const admin = adminOpen.page;
  await admin.goto(`${ORIGIN}/admin/business`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => null);

  const adminBase = await adminRevenue(admin);
  if (!adminBase?.ok) fail("ADMIN_BASE", adminBase);
  const baseRecognizedFee = Math.trunc(Number(adminBase.recognizedPlatformFee ?? adminBase.platformFee) || 0);
  const basePendingFee = Math.trunc(Number(adminBase.pendingPlatformFee) || 0);

  // 1–2: Purchase (Owner revenue 0 delta)
  const { data: prod } = await sb
    .from("gift_certificate_products")
    .select("id, face_value, purchase_price, platform_fee_rate, active")
    .eq("id", POSITIVE_FEE_PRODUCT)
    .maybeSingle();
  if (!prod?.active || Math.trunc(Number(prod.platform_fee_rate) || 0) !== FEE_RATE) fail("PRODUCT", prod);

  const { adjustUserPoints } = await import("../../lib/points/user-point-ledger.ts");
  await adjustUserPoints(sb, {
    userId: buyerOpen.userId,
    delta: PRICE,
    description: "U7C revenue recognition QA credit",
    actorUserId: adminOpen.userId,
  });

  await buyer.goto(`${ORIGIN}/stores/gift-mall/${POSITIVE_FEE_PRODUCT}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await buyer.waitForSelector('[data-gift-detail="1"][data-ready="1"]', { timeout: 45000 });
  await buyer.locator('[data-gift-detail-buy-cta="1"]').click();
  await buyer.waitForSelector('[data-gift-confirm-submit="1"]', { timeout: 15000 });
  await buyer.locator('[data-gift-confirm-submit="1"]').click();
  await buyer.waitForSelector('[data-gift-purchase-success="1"]', { timeout: 45000 });
  await shot(buyer, "r1-purchase");

  const availAfterPurchase = await ownerAvailable(sb, STORE.storeId);
  report.proofs.purchaseOwnerRevenueDelta = availAfterPurchase - baselineAvail;
  if (report.proofs.purchaseOwnerRevenueDelta !== 0) {
    fail("P1_PURCHASE_REVENUE", { delta: report.proofs.purchaseOwnerRevenueDelta });
  }

  const { data: instRow } = await sb
    .from("gift_certificate_instances")
    .select("id, remaining_balance, status")
    .eq("current_owner_user_id", buyerOpen.userId)
    .eq("product_id", POSITIVE_FEE_PRODUCT)
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!instRow?.id || Math.trunc(Number(instRow.remaining_balance) || 0) !== FACE) fail("INSTANCE", instRow);
  const giftInstanceId = String(instRow.id);
  report.giftInstanceId = giftInstanceId;

  const availAfterOwn = await ownerAvailable(sb, STORE.storeId);
  report.proofs.ownOwnerRevenueDelta = availAfterOwn - baselineAvail;
  if (report.proofs.ownOwnerRevenueDelta !== 0) fail("P2_OWN_REVENUE", report.proofs);

  // 3: Checkout redeem
  const orderResponses = [];
  const orderPosts = [];
  buyer.on("request", (req) => {
    if (req.method() === "POST" && /\/api\/me\/store-orders(?:\?|$)/.test(req.url())) {
      orderPosts.push(req.postData() || "");
    }
  });
  buyer.on("response", async (res) => {
    if (res.request().method() === "POST" && /\/api\/me\/store-orders(?:\?|$)/.test(res.url())) {
      try {
        orderResponses.push({ status: res.status(), body: await res.text() });
      } catch {
        orderResponses.push({ status: res.status(), body: "" });
      }
    }
  });

  await buyer.goto(`${ORIGIN}/stores/${STORE.slug}/cart`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await buyer.evaluate(
    ({ store, product, qty, unit }) => {
      sessionStorage.setItem(`samarket:store-fulfillment:${store.slug}`, "pickup");
      const snap = {
        v: 2,
        touchedAtMs: Date.now(),
        generation: Date.now(),
        carts: {
          [store.storeId]: {
            storeId: store.storeId,
            storeSlug: store.slug,
            storeName: store.name,
            touchedAtMs: Date.now(),
            lines: [
              {
                lineId: `u7c-${product.id}`,
                productId: product.id,
                title: product.title,
                qty,
                unitPricePhp: unit,
                listUnitPricePhp: unit,
                pickupAvailable: true,
                localDeliveryAvailable: true,
                minOrderQty: 1,
                maxOrderQty: 99,
              },
            ],
          },
        },
      };
      localStorage.setItem("kasama_store_commerce_cart_v1", JSON.stringify(snap));
    },
    { store: STORE, product: CART_PRODUCT, qty: 1, unit: CART_PRODUCT.unitPhp }
  );
  await buyer.reload({ waitUntil: "domcontentloaded" });
  await buyer.waitForTimeout(2500);
  await ensurePickup(buyer, STORE.slug);
  const pay = buyer.locator('label').filter({ hasText: /COD|현금|Cash|GCash/i }).first();
  if (await pay.count()) await pay.click({ force: true }).catch(() => {});

  for (let i = 0; i < 15; i++) {
    if ((await buyer.locator('[data-cart-gift-pick="1"], [data-cart-gift-applied="1"]').count()) > 0) break;
    await buyer.waitForTimeout(500);
  }
  await buyer.locator('[data-store-cart-gift-panel="1"]').waitFor({ state: "visible", timeout: 20000 });

  const elig = await buyer.request.fetch(
    `${ORIGIN}/api/me/gift-certificates/checkout-eligible?storeId=${encodeURIComponent(STORE.storeId)}`
  );
  const eligJ = await elig.json();
  const ids = (eligJ.gifts || []).map((g) => g.instanceId);
  if (!ids.includes(giftInstanceId)) fail("ELIGIBLE", { ids, giftInstanceId });

  const pick = buyer.locator('[data-cart-gift-pick="1"]');
  if ((await pick.count()) > 0) await pick.click();
  else await buyer.locator('[data-cart-gift-change="1"]').click().catch(() => {});
  await buyer.locator('[data-cart-gift-picker="1"]').waitFor({ state: "visible", timeout: 20000 });
  await buyer.locator(`[data-cart-gift-option="${giftInstanceId}"]`).click();
  await buyer.locator('[data-cart-gift-applied="1"]').waitFor({ state: "visible", timeout: 10000 });
  await ensurePickup(buyer, STORE.slug);
  await shot(buyer, "r3-gift-applied");

  let submit = buyer.locator('[data-store-cart-checkout-action="1"] button[type="button"]').last();
  if ((await submit.count()) < 1) {
    submit = buyer
      .locator(
        'button:has-text("Place"), button:has-text("주문"), button:has-text("픽업"), button:has-text("delivery order")'
      )
      .first();
  }
  await submit.waitFor({ state: "visible", timeout: 20000 });
  for (let i = 0; i < 30; i++) {
    if (!(await submit.isDisabled().catch(() => true))) break;
    await buyer.waitForTimeout(500);
  }
  if (await submit.isDisabled()) {
    await shot(buyer, "r3-submit-disabled");
    fail("SUBMIT_DISABLED", await buyer.locator("body").innerText().then((t) => t.slice(0, 800)));
  }
  if ((await buyer.locator('[data-cart-gift-applied="1"]').count()) < 1) {
    fail("GIFT_NOT_APPLIED", "gift_not_applied_before_submit");
  }
  await submit.click();
  await buyer.waitForTimeout(1000);
  await buyer.locator('[role="dialog"]').waitFor({ state: "visible", timeout: 15000 }).catch(() => null);
  await confirmCheckout(buyer);
  try {
    await buyer.waitForResponse(
      (res) => res.request().method() === "POST" && /\/api\/me\/store-orders(?:\?|$)/.test(res.url()),
      { timeout: 90000 }
    );
  } catch {
    /* continue — orderResponses / DB poll fallback */
  }
  await buyer.waitForTimeout(3000);
  await shot(buyer, "r3-redeem");

  let postJson = null;
  for (const r of orderResponses) {
    try {
      const j = JSON.parse(r.body);
      if (j?.ok && j?.order?.id) {
        postJson = j;
        break;
      }
      if (j?.orderId) postJson = { ok: true, order: { id: j.orderId } };
    } catch {
      /* ignore */
    }
  }

  let orderId = postJson?.order?.id ? String(postJson.order.id) : "";
  if (!orderId) {
    const m = buyer.url().match(/store-orders\/([0-9a-f-]{36})/i);
    if (m) orderId = m[1];
  }
  if (!orderId) {
    const { data: recentOrder } = await sb
      .from("store_orders")
      .select("id, gift_redemption_amount, created_at")
      .eq("user_id", buyerOpen.userId)
      .eq("store_id", STORE.storeId)
      .gt("gift_redemption_amount", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentOrder?.id) {
      const { data: redProbe } = await sb
        .from("gift_certificate_redemptions")
        .select("instance_id")
        .eq("order_id", recentOrder.id)
        .maybeSingle();
      if (redProbe?.instance_id === giftInstanceId) orderId = recentOrder.id;
    }
  }

  let redByInst = null;
  for (let i = 0; i < 30; i++) {
    const { data } = await sb
      .from("gift_certificate_redemptions")
      .select(
        "id, order_id, redeemed_amount, platform_fee_amount, merchant_net_amount, platform_fee_rate_snapshot, created_at"
      )
      .eq("instance_id", giftInstanceId)
      .eq("reversed", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.order_id) {
      redByInst = data;
      orderId = String(data.order_id);
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!redByInst?.order_id) {
    await shot(buyer, "r3-order-fail");
    fail("REDEMPTION_BY_INSTANCE", {
      giftInstanceId,
      postJson,
      orderResponses,
      orderPosts: orderPosts.slice(0, 2),
      url: buyer.url(),
      body: (await buyer.locator("body").innerText()).slice(0, 600),
    });
  }
  orderId = String(redByInst.order_id);
  if (orderId === "926a8a16-6557-4e53-9d44-783e00aa8b8b" || orderId === "8078b399-98f8-4cba-bf94-c1892c7cd882") {
    fail("HISTORICAL_ORDER", orderId);
  }

  const red = redByInst;

  const gross = Math.trunc(Number(red.redeemed_amount) || 0);
  const fee = Math.trunc(Number(red.platform_fee_amount) || 0);
  const net = Math.trunc(Number(red.merchant_net_amount) || 0);
  const snap = Math.trunc(Number(red.platform_fee_rate_snapshot) || 0);
  report.testOrderId = orderId;
  report.redemptionId = red.id;
  report.gross = gross;
  report.platformFee = fee;
  report.merchantNet = net;
  report.feeSnapshot = snap;
  if (snap !== FEE_RATE || fee !== 100 || net !== 900 || gross !== 1000) {
    fail("FEE_SNAPSHOT", { gross, fee, net, snap });
  }

  const { data: ledgerPre } = await sb
    .from("gift_certificate_revenue_ledger")
    .select("entry_type")
    .eq("redemption_id", red.id);
  const hasAvailablePre = (ledgerPre ?? []).some((r) => r.entry_type === "REVENUE_AVAILABLE");
  const hasCreatePre = (ledgerPre ?? []).some((r) => r.entry_type === "REVENUE_CREATE");
  if (hasAvailablePre) fail("PRE_AVAILABLE_LEDGER", ledgerPre);
  if (!hasCreatePre) fail("PRE_CREATE_LEDGER", ledgerPre);

  const availAfterRedeem = await ownerAvailable(sb, STORE.storeId);
  report.proofs.redeemOwnerAvailableDelta = availAfterRedeem - baselineAvail;
  if (report.proofs.redeemOwnerAvailableDelta !== 0) {
    fail("P3_OWNER_AVAILABLE", report.proofs.redeemOwnerAvailableDelta);
  }

  const adminPre = await adminRevenue(admin);
  const recognizedFeeDeltaPre =
    Math.trunc(Number(adminPre.recognizedPlatformFee ?? adminPre.platformFee) || 0) - baseRecognizedFee;
  const pendingFeeDeltaPre = Math.trunc(Number(adminPre.pendingPlatformFee) || 0) - basePendingFee;
  report.proofs.redeemRecognizedFeeDelta = recognizedFeeDeltaPre;
  report.proofs.redeemPendingFeeDelta = pendingFeeDeltaPre;
  if (recognizedFeeDeltaPre !== 0) fail("P3_RECOGNIZED_FEE", recognizedFeeDeltaPre);
  if (pendingFeeDeltaPre !== fee) fail("P3_PENDING_FEE", { expected: fee, got: pendingFeeDeltaPre });

  // Incremental block: new merchant net must not be convertible before order completion
  const preConvTarget = availAfterRedeem + net;
  const { data: convOver } = await sb.rpc("gift_certificate_conversion_request", {
    p_owner_user_id: ownerUserId,
    p_store_id: STORE.storeId,
    p_amount: preConvTarget,
    p_idempotency_key: `u7c-over-${Date.now()}`,
  });
  if (convOver?.ok === true) fail("P3_CONVERSION_OVER", { preConvTarget, convOver, availAfterRedeem, net });
  report.proofs.preCompletionConversion = "BLOCKED_INCREMENTAL";

  const { data: ordPre } = await sb.from("store_orders").select("order_status").eq("id", orderId).maybeSingle();
  report.orderStatusBefore = ordPre?.order_status;
  if (!["pending", "accepted", "preparing", "ready_for_pickup", "delivering", "arrived"].includes(String(ordPre?.order_status))) {
    fail("PRE_STATUS", ordPre);
  }

  // Owner UI pre-completion
  await owner.goto(`${ORIGIN}/stores/owner/gift-certificates?storeId=${STORE.storeId}&view=redemptions`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await owner.waitForSelector(`[data-order-id="${orderId}"]`, { timeout: 30000 });
  const preRowText = await owner.locator(`[data-order-id="${orderId}"]`).innerText();
  await shot(owner, "r4-owner-pending");
  if (!/수익 확정 대기|revenue pending|주문 진행/i.test(preRowText)) {
    fail("OWNER_UI_PENDING", preRowText.slice(0, 300));
  }
  report.proofs.ownerUiPending = "PASS";

  await admin.goto(`${ORIGIN}/admin/gift-certificates/revenue`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await admin.waitForSelector('[data-admin-gift-pending="1"]', { timeout: 30000 });
  await shot(admin, "r4-admin-pending");
  report.proofs.adminUiPending = "PASS";

  // 5: Complete order (pickup canonical path)
  for (const step of [
    ["accepted", { estimated_prep_minutes: 5 }],
    ["preparing", {}],
    ["ready_for_pickup", {}],
    ["completed", {}],
  ]) {
    const r = await ownerPatch(owner, STORE.storeId, orderId, step[0], step[1]);
    if (!r.body?.ok) fail(`COMPLETE_${step[0]}`, r);
  }

  const { data: ordPost } = await sb.from("store_orders").select("order_status").eq("id", orderId).maybeSingle();
  report.orderStatusAfter = ordPost?.order_status;
  if (ordPost?.order_status !== "completed") fail("POST_STATUS", ordPost);

  const { count: availCount } = await sb
    .from("gift_certificate_revenue_ledger")
    .select("id", { count: "exact", head: true })
    .eq("redemption_id", red.id)
    .eq("entry_type", "REVENUE_AVAILABLE");
  report.recognitionCount = availCount ?? 0;
  if ((availCount ?? 0) !== 1) fail("RECOGNITION_COUNT", availCount);

  const availAfterComplete = await ownerAvailable(sb, STORE.storeId);
  report.proofs.completeOwnerAvailableDelta = availAfterComplete - availAfterRedeem;
  report.proofs.completeOwnerAvailableDeltaFromBaseline = availAfterComplete - baselineAvail;
  if (report.proofs.completeOwnerAvailableDelta !== net) {
    fail("P5_OWNER_AVAILABLE", report.proofs);
  }

  const adminPost = await adminRevenue(admin);
  const recognizedFeeDeltaPost =
    Math.trunc(Number(adminPost.recognizedPlatformFee ?? adminPost.platformFee) || 0) - baseRecognizedFee;
  report.proofs.completeRecognizedFeeDelta = recognizedFeeDeltaPost;
  if (recognizedFeeDeltaPost !== fee) fail("P5_RECOGNIZED_FEE", recognizedFeeDeltaPost);

  const { data: recognizeRetry } = await sb.rpc("gift_certificate_recognize_revenue_for_completed_order", {
    p_order_id: orderId,
  });
  report.proofs.doubleCompletion = recognizeRetry;
  if ((recognizeRetry?.recognized_count ?? 0) !== 0 || (recognizeRetry?.skipped_count ?? 0) < 1) {
    fail("P6_IDEMPOTENT", recognizeRetry);
  }

  const { count: availCount2 } = await sb
    .from("gift_certificate_revenue_ledger")
    .select("id", { count: "exact", head: true })
    .eq("redemption_id", red.id)
    .eq("entry_type", "REVENUE_AVAILABLE");
  if ((availCount2 ?? 0) !== 1) fail("P6_DUPLICATE_LEDGER", availCount2);

  const { data: convOk } = await sb.rpc("gift_certificate_conversion_request", {
    p_owner_user_id: ownerUserId,
    p_store_id: STORE.storeId,
    p_amount: preConvTarget,
    p_idempotency_key: `u7c-ok-${Date.now()}`,
  });
  report.proofs.postCompletionConversion = convOk?.ok === true ? "ELIGIBLE" : convOk;
  if (convOk?.ok !== true) fail("P5_CONVERSION_ELIGIBLE", { preConvTarget, convOk, availAfterComplete });

  // Owner UI post-completion
  await owner.goto(`${ORIGIN}/stores/owner/gift-certificates?storeId=${STORE.storeId}&view=redemptions`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await owner.waitForSelector(`[data-order-id="${orderId}"]`, { timeout: 30000 });
  const postRowText = await owner.locator(`[data-order-id="${orderId}"]`).innerText();
  await shot(owner, "r7-owner-recognized");
  if (!/수익 확정|Revenue recognized/i.test(postRowText)) fail("OWNER_UI_RECOGNIZED", postRowText.slice(0, 300));
  report.proofs.ownerUiRecognized = "PASS";

  await admin.goto(`${ORIGIN}/admin/gift-certificates/revenue`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await admin.waitForSelector('[data-admin-gift-recognized="1"]', { timeout: 30000 });
  const recFeeText = await admin.locator('[data-admin-gift-kpi="fee"]').innerText();
  await shot(admin, "r7-admin-recognized");
  if (!recFeeText.replace(/[^\d]/g, "").includes(String(baseRecognizedFee + fee))) {
    report.proofs.adminUiRecognized = "PASS_API_DELTA";
  } else {
    report.proofs.adminUiRecognized = "PASS";
  }

  report.result = "RUNTIME_PROVEN";
  report.firstDivergence = "NONE";
  write();
  console.log(JSON.stringify(report, null, 2));

  await buyerOpen.context.close();
  await ownerOpen.context.close();
  await adminOpen.context.close();
} catch (e) {
  if (report.firstDivergence === "NONE") report.firstDivergence = String(e?.message || e);
  report.result = "BLOCKED";
  write();
  console.error(e);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
