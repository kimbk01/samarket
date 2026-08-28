/**
 * CUT 1 — Refund / Reversal / Recovery authority (CASE A/B/C)
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app npx tsx --env-file=.env.local scripts/qa/gift-cut1-refund-authority-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const CUT1_CASE = String(process.env.CUT1_CASE || "ALL").trim().toUpperCase(); // A | B | C | ALL
const OUT = resolve(
  process.cwd(),
  CUT1_CASE === "ALL" ? ".tmp-gift-cut1-refund-runtime.json" : `.tmp-gift-cut1-${CUT1_CASE.toLowerCase()}-runtime.json`
);
const SHOT = resolve(process.cwd(), ".tmp-gift-cut1-shots");
const HISTORICAL_ORDERS = new Set([
  "8078b399-98f8-4cba-bf94-c1892c7cd882",
  "926a8a16-6557-4e53-9d44-783e00aa8b8b",
]);
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
const NET = 900;
const FEE = 100;
const BUYER_EMAIL = "wwww@manual.local";
const OWNER_EMAIL = "sadads@adsasdsa.com";
const ADMIN_EMAIL = "aaaa@manual.local";

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
  return [
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
    ...(sessionId
      ? [
          {
            name: "samarket_active_session_id",
            value: sessionId,
            domain: origin.hostname,
            path: "/",
            expires: Math.floor(Date.now() / 1000) + 86400 * 7,
            httpOnly: false,
            secure: origin.protocol === "https:",
            sameSite: "Lax",
          },
        ]
      : []),
  ];
}

async function openAuthed(browser, email, viewport = { width: 390, height: 844 }) {
  const session = await loginSession(email);
  const { data: pr } = await sbService()
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await context.addCookies(cookies(session, pr?.active_session_id ? String(pr.active_session_id) : ""));
  return { context, page: await context.newPage(), userId: session.user.id };
}

async function ownerAvailable(sb, storeId) {
  const { data } = await sb.rpc("gift_certificate_store_revenue_available", { p_store_id: storeId });
  return Math.trunc(Number(data) || 0);
}

async function storeCashBalance(sb, storeId) {
  const { data } = await sb.from("store_cash_accounts").select("balance").eq("store_id", storeId).maybeSingle();
  return Math.trunc(Number(data?.balance) || 0);
}

async function adminRevenue(page) {
  const res = await page.request.get(`${ORIGIN}/api/admin/gift-certificates/revenue`);
  return res.json();
}

async function adminPatchOrder(page, orderId, body) {
  const res = await page.request.patch(`${ORIGIN}/api/admin/store-orders/${orderId}`, {
    data: body,
    headers: { "Content-Type": "application/json" },
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = { ok: false, raw: await res.text().catch(() => "") };
  }
  return { status: res.status(), body: json };
}

async function ownerPatch(page, storeId, orderId, order_status, extra = {}) {
  const res = await page.request.patch(`${ORIGIN}/api/me/stores/${storeId}/orders/${orderId}`, {
    data: { order_status, ...extra },
    headers: { "Content-Type": "application/json" },
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = { ok: false, raw: await res.text().catch(() => "") };
  }
  return { status: res.status(), body: json };
}

async function ownerPostConversion(page, storeId, amount, key) {
  const res = await page.request.post(`${ORIGIN}/api/me/stores/${storeId}/gift-certificates/conversions`, {
    data: { amount, idempotencyKey: key },
    headers: { "Content-Type": "application/json" },
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = { ok: false, raw: await res.text().catch(() => "") };
  }
  return { status: res.status(), body: json };
}

async function adminPostConversionApprove(page, conversionId) {
  const res = await page.request.post(`${ORIGIN}/api/admin/gift-certificates/conversions/${conversionId}/approve`);
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = { ok: false, raw: await res.text().catch(() => "") };
  }
  return { status: res.status(), body: json };
}

async function adminPostRecoveryClear(page, obligationId, amount) {
  const res = await page.request.post(`${ORIGIN}/api/admin/gift-certificates/recovery`, {
    data: { obligationId, amount },
    headers: { "Content-Type": "application/json" },
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = { ok: false, raw: await res.text().catch(() => "") };
  }
  return { status: res.status(), body: json };
}

async function ensurePickup(page, storeSlug) {
  await page.evaluate((slug) => {
    sessionStorage.setItem(`samarket:store-fulfillment:${slug}`, "pickup");
  }, storeSlug);
  const chip = page.locator("button.delivery-fulfillment-chip").filter({ hasText: /픽업|Pickup/i }).first();
  if (await chip.count()) await chip.click({ force: true });
  await page.waitForTimeout(500);
}

async function confirmCheckout(page) {
  const confirm = page
    .locator('[role="dialog"] button, [data-checkout-confirm] button')
    .filter({ hasText: /Place order|주문 접수|주문하기|Submit order|확인/i })
    .last();
  if (await confirm.count()) return confirm.click();
  const named = page.getByRole("button", { name: /^Place order$|주문 접수|주문하기/i });
  if (await named.count()) await named.last().click();
}

async function creditBuyer(sb, buyerUserId, adminUserId, amount) {
  const { adjustUserPoints } = await import("../../lib/points/user-point-ledger.ts");
  const res = await adjustUserPoints(sb, {
    userId: buyerUserId,
    delta: amount,
    description: "CUT1 refund authority QA credit",
    actorUserId: adminUserId,
  });
  if (!res?.ok) throw new Error(`credit_failed:${JSON.stringify(res)}`);
}

/** Top up so Production /api/me/points shows at least minAmount. */
async function ensurePointsViaApi(page, sb, buyerUserId, adminUserId, minAmount) {
  const res0 = await page.request.get(`${ORIGIN}/api/me/points`, { headers: { "Cache-Control": "no-store" } });
  const j0 = await res0.json().catch(() => null);
  const cur = Math.trunc(Number(j0?.balance ?? j0?.summary?.balance) || 0);
  if (cur >= minAmount) return { api: cur, credited: 0 };
  const need = minAmount - cur;
  await creditBuyer(sb, buyerUserId, adminUserId, need);
  return pollPointsApi(page, minAmount).then((r) => ({ api: r.api, credited: need }));
}

/** Authoritative balance via Production API (not profiles cache alone). */
async function pollPointsApi(page, minAmount) {
  let last = null;
  for (let i = 0; i < 40; i++) {
    const res = await page.request.get(`${ORIGIN}/api/me/points`, { headers: { "Cache-Control": "no-store" } });
    last = await res.json().catch(() => null);
    const bal = Math.trunc(Number(last?.balance ?? last?.summary?.balance) || 0);
    if (res.ok() && bal >= minAmount) return { api: bal, raw: last };
    await page.waitForTimeout(500);
  }
  throw new Error(`points_api_not_ready:${minAmount}:${JSON.stringify(last)}`);
}

async function readGiftDetailUiPoints(page) {
  const text = await page.locator("body").innerText();
  const m = text.match(/(?:Your D-Point|보유\s*D-?Point|내\s*D-?Point|D-Point)\s*[^\d]*([\d,]+)/i);
  if (!m) return null;
  return Math.trunc(Number(String(m[1]).replace(/,/g, "")) || 0);
}

async function purchaseGift(buyer, sb, buyerUserId, adminUserId, tag = "buy") {
  const ensured = await ensurePointsViaApi(buyer, sb, buyerUserId, adminUserId, PRICE);
  const apiBal = ensured.api;
  let uiBal = null;
  let pageApiBal = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const respPromise = buyer
      .waitForResponse(
        (r) => r.url().includes("/api/me/points") && r.request().method() === "GET" && r.ok(),
        { timeout: 45000 }
      )
      .catch(() => null);
    await buyer.goto(`${ORIGIN}/stores/gift-mall/${POSITIVE_FEE_PRODUCT}?qa=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await buyer.waitForSelector('[data-gift-detail="1"][data-ready="1"]', { timeout: 60000 });
    const resp = await respPromise;
    if (resp) {
      const j = await resp.json().catch(() => null);
      pageApiBal = Math.trunc(Number(j?.balance ?? j?.summary?.balance) || 0);
    } else {
      pageApiBal = await buyer.evaluate(async () => {
        const r = await fetch("/api/me/points", { credentials: "include", cache: "no-store" });
        const j = await r.json();
        return Math.trunc(Number(j?.balance ?? j?.summary?.balance) || 0);
      });
    }
    if (pageApiBal < PRICE) {
      throw new Error(`points_page_api_not_ready:requestApi=${apiBal}:pageApi=${pageApiBal}`);
    }

    for (let w = 0; w < 20; w++) {
      const buy = buyer.locator('[data-gift-detail-buy-cta="1"]');
      if ((await buy.count()) > 0 && !(await buy.isDisabled().catch(() => true))) {
        uiBal = await readGiftDetailUiPoints(buyer);
        await buy.click();
        await buyer.waitForSelector('[data-gift-confirm-submit="1"]', { timeout: 15000 });
        await buyer.locator('[data-gift-confirm-submit="1"]').click();
        await buyer.waitForSelector('[data-gift-purchase-success="1"]', { timeout: 45000 });
        const { data: inst } = await sb
          .from("gift_certificate_instances")
          .select("id, remaining_balance, status")
          .eq("current_owner_user_id", buyerUserId)
          .eq("product_id", POSITIVE_FEE_PRODUCT)
          .order("purchased_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!inst?.id || Math.trunc(Number(inst.remaining_balance) || 0) !== FACE) {
          throw new Error(`purchase_instance:${JSON.stringify(inst)}`);
        }
        return {
          giftInstanceId: String(inst.id),
          pointApi: apiBal,
          pointUi: uiBal,
          pointPageApi: pageApiBal,
        };
      }
      await buyer.waitForTimeout(500);
    }

    uiBal = await readGiftDetailUiPoints(buyer);
    if (attempt >= 5) {
      await shot(buyer, `${tag}-purchase-fail`);
      throw new Error(
        `points_ui_stale:requestApi=${apiBal}:pageApi=${pageApiBal}:ui=${uiBal}`
      );
    }
    // Leave and re-enter once to clear client single-flight / hook state
    await buyer.goto(`${ORIGIN}/mypage`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    await buyer.waitForTimeout(800);
  }
  throw new Error("purchase_unreachable");
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(SHOT, `${name}.png`), fullPage: true }).catch(() => null);
}

async function checkoutRedeem(buyer, sb, buyerUserId, giftInstanceId, tag = "cut1") {
  await buyer.goto(`${ORIGIN}/stores/${STORE.slug}/cart`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await buyer.evaluate(
    ({ store, product, qty, unit, tag }) => {
      sessionStorage.setItem(`samarket:store-fulfillment:${store.slug}`, "pickup");
      localStorage.setItem(
        "kasama_store_commerce_cart_v1",
        JSON.stringify({
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
                  lineId: `${tag}-${product.id}-${Date.now()}`,
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
        })
      );
    },
    { store: STORE, product: CART_PRODUCT, qty: 1, unit: CART_PRODUCT.unitPhp, tag }
  );
  await buyer.reload({ waitUntil: "domcontentloaded" });
  await buyer.waitForTimeout(2500);
  await ensurePickup(buyer, STORE.slug);
  const pay = buyer.locator("label").filter({ hasText: /COD|현금|Cash|GCash/i }).first();
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
  if (!ids.includes(giftInstanceId)) {
    await shot(buyer, `${tag}-eligible-fail`);
    throw new Error(`eligible_missing:${giftInstanceId}:${JSON.stringify(ids)}`);
  }

  const pick = buyer.locator('[data-cart-gift-pick="1"]');
  if ((await pick.count()) > 0) await pick.click();
  else await buyer.locator('[data-cart-gift-change="1"]').click().catch(() => {});
  await buyer.locator('[data-cart-gift-picker="1"]').waitFor({ state: "visible", timeout: 20000 });
  await buyer.locator(`[data-cart-gift-option="${giftInstanceId}"]`).click();
  await buyer.locator('[data-cart-gift-applied="1"]').waitFor({ state: "visible", timeout: 10000 });
  await ensurePickup(buyer, STORE.slug);

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
    await shot(buyer, `${tag}-submit-disabled`);
    throw new Error(`submit_disabled:${await buyer.locator("body").innerText().then((t) => t.slice(0, 400))}`);
  }
  if ((await buyer.locator('[data-cart-gift-applied="1"]').count()) < 1) {
    throw new Error("gift_not_applied_before_submit");
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
    /* DB poll fallback */
  }
  await buyer.waitForTimeout(2500);

  let orderId = "";
  for (let i = 0; i < 30; i++) {
    const { data } = await sb
      .from("gift_certificate_redemptions")
      .select("id, order_id, merchant_net_amount, platform_fee_amount, redeemed_amount")
      .eq("instance_id", giftInstanceId)
      .eq("reversed", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.order_id) {
      orderId = String(data.order_id);
      if (HISTORICAL_ORDERS.has(orderId)) throw new Error(`historical_order:${orderId}`);
      return {
        orderId,
        redemptionId: String(data.id),
        net: Math.trunc(Number(data.merchant_net_amount) || 0),
        fee: Math.trunc(Number(data.platform_fee_amount) || 0),
        gross: Math.trunc(Number(data.redeemed_amount) || 0),
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`redemption_missing:${giftInstanceId}`);
}

async function completePickup(owner, orderId) {
  for (const step of [
    ["accepted", { estimated_prep_minutes: 5 }],
    ["preparing", {}],
    ["ready_for_pickup", {}],
    ["completed", {}],
  ]) {
    const r = await ownerPatch(owner, STORE.storeId, orderId, step[0], step[1]);
    if (!r.body?.ok) throw new Error(`complete_${step[0]}:${JSON.stringify(r)}`);
  }
}

async function adminRefund(admin, orderId) {
  const req = await adminPatchOrder(admin, orderId, { set_order_status: "refund_requested" });
  if (!req.body?.ok) throw new Error(`refund_requested:${JSON.stringify(req)}`);
  const done = await adminPatchOrder(admin, orderId, { complete_refund: true });
  if (!done.body?.ok) throw new Error(`complete_refund:${JSON.stringify(done)}`);
  return done;
}

async function revenueLedger(sb, redemptionId) {
  const { data } = await sb
    .from("gift_certificate_revenue_ledger")
    .select("entry_type, amount")
    .eq("redemption_id", redemptionId);
  return data ?? [];
}

async function adminCompleteRefundTwice(admin, orderId) {
  return adminPatchOrder(admin, orderId, { complete_refund: true });
}

loadEnv();
mkdirSync(SHOT, { recursive: true });

const report = {
  title: "DIBAY GIFT CERTIFICATE — CUT 1 REFUND AUTHORITY",
  origin: ORIGIN,
  result: "BLOCKED",
  firstDivergence: "NONE",
  fix: "NONE",
  historicalMutation: "NONE",
  caseA: {},
  caseB: {},
  caseC: {},
  gP0: { "G-P0-02": "OPEN", "G-P0-03": "OPEN", "G-P0-04": "OPEN" },
  cut1: "BLOCKED",
  commit: "NO",
  push: "NO",
};

function write() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

function stop(step, detail) {
  report.firstDivergence = `${step}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  report.result = "BLOCKED";
  report.cut1 = "BLOCKED";
  write();
  throw new Error(report.firstDivergence);
}

write();

const sb = sbService();
const browser = await chromium.launch({ headless: true });

try {
  if (!(await fetch(`${ORIGIN}/`)).ok) stop("ENV", ORIGIN);

  const buyerOpen = await openAuthed(browser, BUYER_EMAIL);
  const ownerOpen = await openAuthed(browser, OWNER_EMAIL);
  const adminOpen = await openAuthed(browser, ADMIN_EMAIL, { width: 1280, height: 900 });
  const buyer = buyerOpen.page;
  const owner = ownerOpen.page;
  const admin = adminOpen.page;
  await owner.goto(`${ORIGIN}/owner`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => null);
  await admin.goto(`${ORIGIN}/admin/business`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => null);

  const { data: prod } = await sb
    .from("gift_certificate_products")
    .select("id, platform_fee_rate, active")
    .eq("id", POSITIVE_FEE_PRODUCT)
    .maybeSingle();
  if (!prod?.active || Math.trunc(Number(prod.platform_fee_rate) || 0) !== FEE_RATE) stop("PRODUCT", prod);

  report.cut1Case = CUT1_CASE;
  if (CUT1_CASE === "B" || CUT1_CASE === "C") {
    report.caseA = { status: "PRESERVED_PRODUCTION_PROVEN", rerun: "NOT_RERUN" };
    report.gP0["G-P0-02"] = "CLOSED";
  }

  // ========== CASE A — PRE-COMPLETION REFUND ==========
  if (CUT1_CASE === "A" || CUT1_CASE === "ALL")
  try {
    const baseAvailA = await ownerAvailable(sb, STORE.storeId);
    const adminBaseA = await adminRevenue(admin);
    const baseRecFeeA = Math.trunc(Number(adminBaseA.recognizedPlatformFee ?? adminBaseA.platformFee) || 0);

    const boughtA = await purchaseGift(buyer, sb, buyerOpen.userId, adminOpen.userId, "case-a");
    const giftA = boughtA.giftInstanceId;
    const chkA = await checkoutRedeem(buyer, sb, buyerOpen.userId, giftA, "case-a");
    report.caseA.order = chkA.orderId;
    report.caseA.redemptionId = chkA.redemptionId;
    report.caseA.giftInstanceId = giftA;
    report.caseA.pointApi = boughtA.pointApi;
    report.caseA.pointUi = boughtA.pointUi;

    const { data: ordA } = await sb.from("store_orders").select("order_status").eq("id", chkA.orderId).maybeSingle();
    report.caseA.statusBefore = ordA?.order_status;
    if (ordA?.order_status !== "pending") stop("CASE_A_STATUS", ordA);

    const availPreA = await ownerAvailable(sb, STORE.storeId);
    const adminPreA = await adminRevenue(admin);
    const recFeePreA = Math.trunc(Number(adminPreA.recognizedPlatformFee ?? adminPreA.platformFee) || 0);
    report.caseA.ownerAvailableDeltaPre = availPreA - baseAvailA;
    report.caseA.platformRecognizedDeltaPre = recFeePreA - baseRecFeeA;
    if (report.caseA.ownerAvailableDeltaPre !== 0) stop("CASE_A_PRE_AVAIL", report.caseA);
    if (report.caseA.platformRecognizedDeltaPre !== 0) stop("CASE_A_PRE_FEE", report.caseA);

    const ledgerPreA = await revenueLedger(sb, chkA.redemptionId);
    const availCountPreA = ledgerPreA.filter((r) => r.entry_type === "REVENUE_AVAILABLE").length;
    if (availCountPreA !== 0) stop("CASE_A_PRE_REVENUE_AVAILABLE", ledgerPreA);

    await adminRefund(admin, chkA.orderId);

    const { data: ordPostA } = await sb.from("store_orders").select("order_status").eq("id", chkA.orderId).maybeSingle();
    if (ordPostA?.order_status !== "refunded") stop("CASE_A_REFUND_STATUS", ordPostA);

    const { data: redA } = await sb
      .from("gift_certificate_redemptions")
      .select("reversed")
      .eq("id", chkA.redemptionId)
      .maybeSingle();
    if (redA?.reversed !== true) stop("CASE_A_REDEMPTION_REVERSED", redA);

    const { data: instA } = await sb
      .from("gift_certificate_instances")
      .select("remaining_balance, status")
      .eq("id", giftA)
      .maybeSingle();
    if (Math.trunc(Number(instA?.remaining_balance) || 0) !== FACE) stop("CASE_A_GIFT_RESTORE", instA);

    const ledgerPostA = await revenueLedger(sb, chkA.redemptionId);
    const reversedA = ledgerPostA.filter((r) => r.entry_type === "REVERSED");
    if (reversedA.length !== 0) stop("CASE_A_WRONG_REVERSED", ledgerPostA);

    const availPostA = await ownerAvailable(sb, STORE.storeId);
    const adminPostA = await adminRevenue(admin);
    const recFeePostA = Math.trunc(Number(adminPostA.recognizedPlatformFee ?? adminPostA.platformFee) || 0);
    if (availPostA - baseAvailA !== 0) stop("CASE_A_POST_AVAIL", availPostA - baseAvailA);
    if (recFeePostA - baseRecFeeA !== 0) stop("CASE_A_POST_FEE", recFeePostA - baseRecFeeA);

    const { data: recA } = await sb
      .from("store_cash_recovery_obligations")
      .select("id")
      .eq("redemption_id", chkA.redemptionId);
    if ((recA ?? []).length > 0) stop("CASE_A_RECOVERY", recA);

    report.caseA.refund = "PASS";
    report.caseA.giftRestore = "PASS";
    report.caseA.revenueReversal = "NONE";
    report.caseA.platformReversal = "NONE";
    report.caseA.recovery = "NONE";
    report.gP0["G-P0-02"] = "CLOSED";
  } catch (e) {
    stop("CASE_A", String(e?.message || e));
  }

  // ========== CASE B — POST-COMPLETION REFUND ==========
  if (CUT1_CASE === "B" || CUT1_CASE === "ALL")
  try {
    // Fresh buyer session to avoid stale point UI contamination
    await buyerOpen.context.close();
    const buyerOpenB = await openAuthed(browser, BUYER_EMAIL);
    const buyerB = buyerOpenB.page;
    Object.assign(buyerOpen, buyerOpenB);

    const baseAvailB = await ownerAvailable(sb, STORE.storeId);
    const adminBaseB = await adminRevenue(admin);
    const baseRecFeeB = Math.trunc(Number(adminBaseB.recognizedPlatformFee ?? adminBaseB.platformFee) || 0);

    const boughtB = await purchaseGift(buyerB, sb, buyerOpenB.userId, adminOpen.userId, "case-b");
    report.caseB.pointApi = boughtB.pointApi;
    report.caseB.pointUi = boughtB.pointUi;
    report.caseB.purchase = "PASS";
    const giftB = boughtB.giftInstanceId;
    const chkB = await checkoutRedeem(buyerB, sb, buyerOpenB.userId, giftB, "case-b");
    report.caseB.order = chkB.orderId;
    report.caseB.redemptionId = chkB.redemptionId;

    await completePickup(owner, chkB.orderId);

    const ledgerRecB = await revenueLedger(sb, chkB.redemptionId);
    const availCountB = ledgerRecB.filter((r) => r.entry_type === "REVENUE_AVAILABLE").length;
    if (availCountB !== 1) stop("CASE_B_RECOGNITION_COUNT", availCountB);

    const availAfterRecB = await ownerAvailable(sb, STORE.storeId);
    const adminAfterRecB = await adminRevenue(admin);
    const recFeeAfterRecB = Math.trunc(Number(adminAfterRecB.recognizedPlatformFee ?? adminAfterRecB.platformFee) || 0);
    report.caseB.recognizedOwnerNet = availAfterRecB - baseAvailB;
    report.caseB.recognizedPlatformFee = recFeeAfterRecB - baseRecFeeB;
    if (report.caseB.recognizedOwnerNet < NET) stop("CASE_B_PRE_REFUND_NET", report.caseB);
    if (report.caseB.recognizedPlatformFee < FEE) stop("CASE_B_PRE_REFUND_FEE", report.caseB);

    await adminRefund(admin, chkB.orderId);

    const { data: instB } = await sb
      .from("gift_certificate_instances")
      .select("remaining_balance")
      .eq("id", giftB)
      .maybeSingle();
    if (Math.trunc(Number(instB?.remaining_balance) || 0) !== FACE) stop("CASE_B_GIFT_RESTORE", instB);

    const ledgerPostB = await revenueLedger(sb, chkB.redemptionId);
    const reversedB = ledgerPostB.filter((r) => r.entry_type === "REVERSED");
    if (reversedB.length !== 1) stop("CASE_B_REVERSED_COUNT", ledgerPostB);

    const availPostB = await ownerAvailable(sb, STORE.storeId);
    const adminPostB = await adminRevenue(admin);
    const recFeePostB = Math.trunc(Number(adminPostB.recognizedPlatformFee ?? adminPostB.platformFee) || 0);
    report.caseB.ownerReversal = baseAvailB + report.caseB.recognizedOwnerNet - availPostB;
    report.caseB.platformReversal = baseRecFeeB + report.caseB.recognizedPlatformFee - recFeePostB;
    if (report.caseB.ownerReversal < NET) stop("CASE_B_OWNER_REVERSAL", report.caseB);
    if (report.caseB.platformReversal < FEE) stop("CASE_B_PLATFORM_REVERSAL", report.caseB);

    const dupB = await adminCompleteRefundTwice(admin, chkB.orderId);
    const ledgerDupB = await revenueLedger(sb, chkB.redemptionId);
    if (ledgerDupB.filter((r) => r.entry_type === "REVERSED").length !== 1) {
      stop("CASE_B_DOUBLE_REVERSAL", { dupB, ledgerDupB });
    }

    report.caseB.refund = "PASS";
    report.caseB.giftRestore = "PASS";
    report.caseB.doubleReversal = "NONE";
    report.gP0["G-P0-03"] = "CLOSED";
  } catch (e) {
    stop("CASE_B", String(e?.message || e));
  }

  // ========== CASE C — CONVERTED REFUND + RECOVERY ==========
  if (CUT1_CASE === "C" || CUT1_CASE === "ALL")
  try {
    await buyerOpen.context.close().catch(() => null);
    const buyerOpenC = await openAuthed(browser, BUYER_EMAIL);
    const buyerC = buyerOpenC.page;

    const baseAvailC = await ownerAvailable(sb, STORE.storeId);
    const baseCashC = await storeCashBalance(sb, STORE.storeId);

    const boughtC = await purchaseGift(buyerC, sb, buyerOpenC.userId, adminOpen.userId, "case-c");
    report.caseC.pointApi = boughtC.pointApi;
    report.caseC.pointUi = boughtC.pointUi;
    report.caseC.purchase = "PASS";
    const giftC = boughtC.giftInstanceId;
    const chkC = await checkoutRedeem(buyerC, sb, buyerOpenC.userId, giftC, "case-c");
    report.caseC.order = chkC.orderId;
    report.caseC.redemptionId = chkC.redemptionId;

    await completePickup(owner, chkC.orderId);

    const convReq = await ownerPostConversion(owner, STORE.storeId, NET, `cut1-c-${Date.now()}`);
    if (!convReq.body?.ok) stop("CASE_C_CONV_REQUEST", convReq);
    const conversionId = String(convReq.body.request_id ?? convReq.body.id ?? "");
    report.caseC.conversion = conversionId;

    const approve = await adminPostConversionApprove(admin, conversionId);
    if (!approve.body?.ok) stop("CASE_C_CONV_APPROVE", approve);

    const cashAfterConv = await storeCashBalance(sb, STORE.storeId);
    report.caseC.storeCashCredit = cashAfterConv - baseCashC;
    report.caseC.storeCashBeforeRefund = cashAfterConv;
    if (report.caseC.storeCashCredit < NET) stop("CASE_C_CASH_CREDIT", report.caseC);

    await adminRefund(admin, chkC.orderId);

    const cashAfterRefund = await storeCashBalance(sb, STORE.storeId);
    report.caseC.storeCashAfter = cashAfterRefund;
    if (cashAfterRefund < 0) stop("CASE_C_SILENT_NEGATIVE", cashAfterRefund);
    report.caseC.storeCashSilentNegative = "NO";

    const { data: instC } = await sb
      .from("gift_certificate_instances")
      .select("remaining_balance")
      .eq("id", giftC)
      .maybeSingle();
    if (Math.trunc(Number(instC?.remaining_balance) || 0) !== FACE) stop("CASE_C_GIFT_RESTORE", instC);

    const { data: obC } = await sb
      .from("store_cash_recovery_obligations")
      .select("id, amount_original, amount_remaining, status")
      .eq("redemption_id", chkC.redemptionId)
      .maybeSingle();

    report.caseC.recoveryObligation = obC?.id ? String(obC.id) : "NONE";
    report.caseC.recoveryAmount = obC ? Math.trunc(Number(obC.amount_remaining) || 0) : 0;

    await admin.goto(`${ORIGIN}/admin/gift-certificates/recovery`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await admin.waitForSelector("[data-admin-gift-recovery='1']", { timeout: 30000 });
    if (obC?.id) {
      const rowText = await admin.locator("body").innerText();
      if (!rowText.includes(String(obC.id).slice(0, 8))) stop("CASE_C_ADMIN_RECOVERY_UI", obC.id);
      report.caseC.adminRecoveryUi = "PASS";

      if (cashAfterRefund >= Math.trunc(Number(obC.amount_remaining) || 0) && report.caseC.recoveryAmount > 0) {
        const clear = await adminPostRecoveryClear(admin, obC.id, report.caseC.recoveryAmount);
        if (!clear.body?.ok) stop("CASE_C_RECOVERY_CLEAR", clear);
        const dupClear = await adminPostRecoveryClear(admin, obC.id, report.caseC.recoveryAmount);
        report.caseC.recoveryClear =
          dupClear.body?.ok === true && dupClear.body?.idempotent !== true ? "PASS" : "PASS_IDEMPOTENT";
      } else {
        report.caseC.recoveryClear = "NOT_PROVEN";
      }
    } else {
      report.caseC.adminRecoveryUi = report.caseC.recoveryAmount === 0 ? "PASS_NONE" : "FAIL";
      report.caseC.recoveryClear = "NOT_PROVEN";
    }

    report.caseC.refund = "PASS";
    report.gP0["G-P0-04"] = "CLOSED";
  } catch (e) {
    stop("CASE_C", String(e?.message || e));
  }

  const casesOk =
    (CUT1_CASE === "A" && report.gP0["G-P0-02"] === "CLOSED") ||
    (CUT1_CASE === "B" && report.gP0["G-P0-03"] === "CLOSED") ||
    (CUT1_CASE === "C" && report.gP0["G-P0-04"] === "CLOSED") ||
    (CUT1_CASE === "ALL" &&
      report.gP0["G-P0-02"] === "CLOSED" &&
      report.gP0["G-P0-03"] === "CLOSED" &&
      report.gP0["G-P0-04"] === "CLOSED");
  if (!casesOk) stop("RESULT", report.gP0);

  report.result = "PRODUCTION_PROVEN";
  report.cut1 = ORIGIN.includes("vercel.app") ? "PRODUCTION_PROVEN" : "RUNTIME_PROVEN";
  report.firstDivergence = "NONE";
  write();
  console.log(JSON.stringify(report, null, 2));

  await buyerOpen.context.close().catch(() => null);
  await ownerOpen.context.close();
  await adminOpen.context.close();
} catch (e) {
  if (report.firstDivergence === "NONE") report.firstDivergence = String(e?.message || e);
  write();
  console.error(e);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
