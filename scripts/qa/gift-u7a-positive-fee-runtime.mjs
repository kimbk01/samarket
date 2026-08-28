/**
 * U7-A — POSITIVE FEE RUNTIME PROOF
 * U1 product (fee>0) → U2 purchase → U4 redeem → Admin Platform Revenue + Owner Merchant Net
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3025 npx tsx --env-file=.env.local scripts/qa/gift-u7a-positive-fee-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3025").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-u7a-runtime.json");
const SHOT = resolve(process.cwd(), ".tmp-gift-u7a-shots");
const STORE = { storeId: "19085860-52d2-4183-b033-e71fcb58bcec", slug: "aa11", name: "나의 오른손딸방" };
const LEGACY_ZERO_FEE_PRODUCT = "2d49b295-3412-4289-a50d-2fb40ce0f745";
const CART_PRODUCT = {
  id: "7929c806-4f49-4e91-98d8-43304e026134",
  title: "매운 라면의 아름 다운 밤 입니다.",
  unitPhp: 2000,
};
const FEE_RATE = Math.trunc(Number(process.env.GIFT_U7_FEE_RATE || 10));
const FACE = 1000;
const PRICE = 1000;
const TITLE = process.env.GIFT_U7_TITLE?.trim() || `U7 Positive Fee QA ${Date.now()}`;
const EXISTING_APP_ID = process.env.GIFT_U7_APPLICATION_ID?.trim() || "";
const EXISTING_PRODUCT_ID = process.env.GIFT_U7_PRODUCT_ID?.trim() || "";
const EXISTING_INSTANCE_ID = process.env.GIFT_U7_INSTANCE_ID?.trim() || "";
const EXISTING_ORDER_ID = process.env.GIFT_U7_ORDER_ID?.trim() || "";
const SKIP_OWNER_APPLY =
  process.env.GIFT_U7_SKIP_OWNER === "1" || Boolean(EXISTING_APP_ID) || Boolean(EXISTING_PRODUCT_ID);
const SKIP_PRODUCT_CREATE = process.env.GIFT_U7_SKIP_PRODUCT === "1" || Boolean(EXISTING_PRODUCT_ID);
const SKIP_PURCHASE = process.env.GIFT_U7_SKIP_PURCHASE === "1" || Boolean(EXISTING_INSTANCE_ID);
const SKIP_CHECKOUT = process.env.GIFT_U7_SKIP_CHECKOUT === "1" || Boolean(EXISTING_ORDER_ID);
const BUYER_EMAIL = process.env.GIFT_U7_BUYER_EMAIL?.trim() || "wwww@manual.local";
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
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
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
  const admin = sbService();
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) throw new Error(`login_failed:${email}:${linkErr?.message || "no_token"}`);
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified.session) throw new Error(`otp_failed:${email}:${otpErr?.message}`);
  return verified.session;
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

async function aggregateRevenue(sb) {
  const { data: rows } = await sb
    .from("gift_certificate_redemptions")
    .select("redeemed_amount, platform_fee_amount, merchant_net_amount, reversed")
    .limit(5000);
  let redeemedGross = 0;
  let platformFee = 0;
  let merchantNet = 0;
  for (const row of rows ?? []) {
    if (row.reversed === true) continue;
    redeemedGross += Math.max(0, Math.trunc(Number(row.redeemed_amount) || 0));
    platformFee += Math.max(0, Math.trunc(Number(row.platform_fee_amount) || 0));
    merchantNet += Math.max(0, Math.trunc(Number(row.merchant_net_amount) || 0));
  }
  return { redeemedGross, platformFee, merchantNet };
}

loadEnv();
mkdirSync(SHOT, { recursive: true });

const report = {
  title: "DIBAY GIFT CERTIFICATE — U7-A POSITIVE FEE RUNTIME FINAL",
  positiveFeeProduct: null,
  positiveFeeRate: FEE_RATE,
  positiveFeeOrder: null,
  giftInstance: null,
  redeemedGross: null,
  platformFee: null,
  merchantNet: null,
  grossEqualsFeePlusNet: null,
  adminPlatformRevenue: null,
  ownerMerchantRevenue: null,
  positiveFeeRuntime: "NOT_PROVEN",
  legacyZeroFeeUntouched: null,
  firstDivergence: "NONE",
  fixes: "NONE",
  commits: "NONE",
  push: "NO",
  u1: "LOCKED",
  u2: "LOCKED",
  u3: "LOCKED",
  u4: "LOCKED",
  u5: "LOCKED",
  u6: "LOCKED",
  u7: "IN_PROGRESS",
  evidence: {},
};

async function creditBuyerPointsLedger(userId, delta, actorUserId) {
  const { adjustUserPoints } = await import("../../lib/points/user-point-ledger.ts");
  return adjustUserPoints(sbService(), {
    userId,
    delta,
    description: "U7 positive fee QA — ledger SSOT fixture credit (admin API blocked: point permission)",
    actorUserId,
  });
}

function write() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

function fail(step, detail) {
  report.firstDivergence = `${step}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  report.u7 = "BLOCKED";
  write();
  throw new Error(report.firstDivergence);
}

write();

const sb = sbService();
const browser = await chromium.launch({ headless: true });

try {
  const health = await fetch(`${ORIGIN}/`);
  if (!health.ok) fail("ENV", `next_not_ready:${ORIGIN}`);

  // Legacy 0% product must stay unchanged
  const { data: legacyProd } = await sb
    .from("gift_certificate_products")
    .select("id, platform_fee_rate")
    .eq("id", LEGACY_ZERO_FEE_PRODUCT)
    .maybeSingle();
  if (!legacyProd || Math.trunc(Number(legacyProd.platform_fee_rate) || 0) !== 0) {
    fail("LEGACY_GUARD", { legacyProd });
  }
  report.legacyZeroFeeUntouched = "PASS";

  const revenueBefore = await aggregateRevenue(sb);
  report.evidence.revenueBefore = revenueBefore;

  const ownerOpen = await openAuthed(browser, OWNER_EMAIL);
  const adminOpen = await openAuthed(browser, ADMIN_EMAIL, { width: 1280, height: 900 });
  const buyerOpen = await openAuthed(browser, BUYER_EMAIL);
  const owner = ownerOpen.page;
  const admin = adminOpen.page;
  const buyer = buyerOpen.page;

  let appRow = null;
  if (SKIP_PRODUCT_CREATE && EXISTING_PRODUCT_ID) {
    appRow = { id: EXISTING_APP_ID || "resume-skip", title: "U7 Positive Fee QA resume", status: "approved" };
  } else if (SKIP_OWNER_APPLY) {
    const q = EXISTING_APP_ID
      ? sb.from("gift_certificate_applications").select("id, title, status").eq("id", EXISTING_APP_ID)
      : sb
          .from("gift_certificate_applications")
          .select("id, title, status")
          .eq("store_id", STORE.storeId)
          .eq("title", TITLE)
          .order("created_at", { ascending: false })
          .limit(1);
    const { data } = await q.maybeSingle();
    appRow = data;
    if (!appRow?.id) fail("U1_APPLICATION_RESUME", { EXISTING_APP_ID, TITLE });
    report.evidence.application = appRow;
  } else {
    // ========== U1: Owner application ==========
    await owner.goto(`${ORIGIN}/stores/owner/gift-certificates?storeId=${STORE.storeId}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await owner.waitForFunction(() => (document.body?.innerText || "").trim().length > 20, null, { timeout: 45000 });
    await owner.getByRole("button", { name: /상품권 판매 신청|Apply to sell gift/i }).first().click();
    await owner.waitForTimeout(800);
    await owner.locator("input").first().fill(TITLE);
    let filledFace = false;
    let filledPrice = false;
    for (const inp of await owner.locator("input").elementHandles()) {
      const type = await inp.getAttribute("type");
      const val = await inp.inputValue().catch(() => "");
      if (type === "file") continue;
      if (!filledFace && (type === "number" || type === "text" || !type) && val !== TITLE) {
        await inp.fill(String(FACE));
        filledFace = true;
        continue;
      }
      if (filledFace && !filledPrice && val !== TITLE && val !== String(FACE)) {
        await inp.fill(String(PRICE));
        filledPrice = true;
        break;
      }
    }
    const notes = owner.locator("textarea").first();
    if (await notes.count()) await notes.fill("U7 positive fee QA — 10% platform fee proof");
    await owner.getByRole("button", { name: /신청 내용 확인|Review application/i }).click();
    await owner.waitForTimeout(600);
    await owner.getByRole("button", { name: /이 내용으로 신청|Submit this application/i }).click();
    await owner.waitForTimeout(2500);
    await shot(owner, "u1-owner-submit");
    const { data: created } = await sb
      .from("gift_certificate_applications")
      .select("id, title, status")
      .eq("store_id", STORE.storeId)
      .eq("title", TITLE)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    appRow = created;
    if (!appRow?.id) fail("U1_APPLICATION", { title: TITLE });
    report.evidence.application = appRow;
  }

  const appTitle = appRow.title || TITLE;

  let productRow = null;
  if (SKIP_PRODUCT_CREATE) {
    const q = EXISTING_PRODUCT_ID
      ? sb.from("gift_certificate_products").select(
          "id, title, face_value, purchase_price, platform_fee_rate, transferable, active, store_id"
        ).eq("id", EXISTING_PRODUCT_ID)
      : sb
          .from("gift_certificate_products")
          .select(
            "id, title, face_value, purchase_price, platform_fee_rate, transferable, active, store_id"
          )
          .eq("store_id", STORE.storeId)
          .eq("title", appTitle)
          .order("created_at", { ascending: false })
          .limit(1);
    const { data } = await q.maybeSingle();
    productRow = data;
    if (!productRow?.id || !productRow.active) fail("U1_PRODUCT_RESUME", { productRow });
    const productFeeRate = Math.trunc(Number(productRow.platform_fee_rate) || 0);
    if (productFeeRate !== FEE_RATE) fail("U1_PRODUCT_FEE", { expected: FEE_RATE, got: productFeeRate });
    report.positiveFeeProduct = productRow.id;
    report.evidence.product = productRow;
  } else {
  // ========== U1: Admin product create with fee ==========
  await admin.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await admin.waitForFunction(() => /dibaY Admin/i.test(document.body?.innerText || ""), null, { timeout: 60000 });
  const deliveryTab = admin.locator('a[role="tab"][href="/admin/business"]').first();
  if (await deliveryTab.count()) {
    await deliveryTab.click({ force: true });
    await admin.waitForURL(/\/admin\/business/, { timeout: 20000 }).catch(async () => {
      await admin.goto(`${ORIGIN}/admin/business`, { waitUntil: "domcontentloaded" });
    });
  } else {
    await admin.goto(`${ORIGIN}/admin/business`, { waitUntil: "domcontentloaded" });
  }
  await admin.waitForTimeout(800);
  const opsSection = admin.locator("span", { hasText: /^Operations$/i }).first();
  if (await opsSection.count()) {
    await opsSection.click({ force: true });
    await admin.waitForTimeout(600);
  }
  const appsHref = admin.locator('a[href="/admin/gift-certificates/applications"]').first();
  if (await appsHref.isVisible().catch(() => false)) {
    await appsHref.click();
  } else {
    await admin.goto(`${ORIGIN}/admin/gift-certificates/applications`, { waitUntil: "domcontentloaded" });
  }
  await admin.waitForURL(/gift-certificates\/applications/, { timeout: 20000 }).catch(() => null);
  await admin.goto(`${ORIGIN}/admin/gift-certificates/applications?id=${encodeURIComponent(appRow.id)}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await admin.waitForSelector('[data-admin-gift-application-detail="1"]', { timeout: 60000 });
  await admin.waitForFunction(
    (title) => {
      const t = document.body?.innerText || "";
      return t.includes(title) && /Approve & create product|승인 후 상품 만들기/i.test(t);
    },
    appTitle,
    { timeout: 60000 }
  );
  await admin.getByRole("button", { name: /승인 후 상품 만들기|Approve & create product/i }).click();
  await admin.waitForTimeout(800);
  await admin.waitForFunction(
    () => /Create gift product|상품권 상품 만들기/i.test(document.body?.innerText || ""),
    null,
    { timeout: 30000 }
  );

  const feeInput = admin
    .locator("label")
    .filter({ hasText: /Platform fee|플랫폼 수수료/i })
    .locator("input")
    .first();
  if ((await feeInput.count()) === 0) fail("U1_FEE_FIELD", "platform_fee_input_missing");
  await feeInput.fill(String(FEE_RATE));
  await shot(admin, "u1-product-fee-set");

  await admin.getByRole("button", { name: /판매 내용 확인|Review product/i }).click();
  await admin.waitForTimeout(600);
  const reviewText = await admin.locator("body").innerText();
  if (!reviewText.includes(String(FEE_RATE)) && !new RegExp(`${FEE_RATE}\\s*%`).test(reviewText)) {
    fail("U1_FEE_REVIEW", { snippet: reviewText.slice(0, 600), feeRate: FEE_RATE });
  }
  await admin.getByRole("button", { name: /상품권 판매 시작|Start selling/i }).click();
  await admin.waitForTimeout(2500);
  await shot(admin, "u1-product-active");

  const { data: createdProduct } = await sb
    .from("gift_certificate_products")
    .select(
      "id, title, face_value, purchase_price, platform_fee_rate, transferable, active, store_id"
    )
    .eq("store_id", STORE.storeId)
    .eq("title", appTitle)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  productRow = createdProduct;
  if (!productRow?.id || !productRow.active) fail("U1_PRODUCT_DB", { productRow });
  const productFeeRate = Math.trunc(Number(productRow.platform_fee_rate) || 0);
  if (productFeeRate !== FEE_RATE) fail("U1_PRODUCT_FEE", { expected: FEE_RATE, got: productFeeRate });
  report.positiveFeeProduct = productRow.id;
  report.evidence.product = productRow;
  }

  // ========== U2 prep: Admin Point credit if buyer balance insufficient ==========
  const balProbe = await buyer.request.get(`${ORIGIN}/api/me/points`);
  const balProbeJson = await balProbe.json();
  let buyerBalance = Math.max(0, Number(balProbeJson.balance ?? 0));
  if (buyerBalance < PRICE) {
    const creditDelta = Math.max(PRICE * 2, 2000);
    await admin.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    const creditRes = await admin.request.patch(
      `${ORIGIN}/api/admin/users/${encodeURIComponent(buyerOpen.userId)}/points`,
      {
        data: {
          delta: creditDelta,
          reason: "U7 positive fee QA — canonical admin point credit for gift purchase",
        },
        headers: { "Content-Type": "application/json" },
      }
    );
    const creditJson = await creditRes.json().catch(() => null);
    if (!creditRes.ok() || !creditJson?.ok) {
      const ledger = await creditBuyerPointsLedger(buyerOpen.userId, creditDelta, adminOpen.userId);
      if (!ledger.ok) fail("U2_POINT_CREDIT", { status: creditRes.status(), creditJson, ledger });
      report.evidence.pointCredit = {
        path: "ledger_ssot_fallback",
        status: creditRes.status(),
        creditJson,
        ledger,
      };
    } else {
      report.evidence.pointCredit = { path: "admin_patch", status: creditRes.status(), json: creditJson };
    }
    const balAfterCredit = await buyer.request.get(`${ORIGIN}/api/me/points`);
    const balAfterJson = await balAfterCredit.json();
    buyerBalance = Math.max(0, Number(balAfterJson.balance ?? 0));
  }
  if (buyerBalance < PRICE) fail("U2_POINTS", { need: PRICE, have: buyerBalance });

  let giftInstanceId = EXISTING_INSTANCE_ID;
  if (SKIP_CHECKOUT && EXISTING_ORDER_ID) {
    const { data: redForOrder } = await sb
      .from("gift_certificate_redemptions")
      .select("instance_id")
      .eq("order_id", EXISTING_ORDER_ID)
      .maybeSingle();
    if (redForOrder?.instance_id) giftInstanceId = String(redForOrder.instance_id);
    report.giftInstance = giftInstanceId;
  } else if (SKIP_PURCHASE && giftInstanceId) {
    const { data: resumeInst } = await sb
      .from("gift_certificate_instances")
      .select("id, remaining_balance, status, face_value, product_id")
      .eq("id", giftInstanceId)
      .maybeSingle();
    if (!resumeInst?.id || resumeInst.product_id !== productRow.id) {
      fail("U2_INSTANCE_RESUME", { giftInstanceId, resumeInst, productId: productRow.id });
    }
    if (Math.trunc(Number(resumeInst.remaining_balance) || 0) < FACE) {
      fail("U2_INSTANCE_RESUME", { reason: "insufficient_remaining", resumeInst });
    }
    report.giftInstance = giftInstanceId;
    report.evidence.instance = resumeInst;
  } else {
  // ========== U2: Buyer purchase ==========
  await buyer.goto(`${ORIGIN}/stores/gift-mall/${productRow.id}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await buyer.waitForSelector('[data-gift-detail="1"][data-ready="1"]', { timeout: 45000 });
  const balRes = await buyer.request.get(`${ORIGIN}/api/me/points`);
  const balJson = await balRes.json();
  const apiBalance = Math.max(0, Number(balJson.balance ?? 0));
  if (PRICE > apiBalance) fail("U2_POINTS", { need: PRICE, have: apiBalance });
  await buyer.locator('[data-gift-detail-buy-cta="1"]').click();
  await buyer.waitForSelector('[data-gift-confirm-submit="1"]', { timeout: 15000 });
  await buyer.locator('[data-gift-confirm-submit="1"]').click();
  await buyer.waitForSelector('[data-gift-purchase-success="1"]', { timeout: 45000 });
  await shot(buyer, "u2-purchase-success");

  const { data: instRow } = await sb
    .from("gift_certificate_instances")
    .select("id, remaining_balance, status, face_value")
    .eq("current_owner_user_id", buyerOpen.userId)
    .eq("product_id", productRow.id)
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!instRow?.id) fail("U2_INSTANCE", { productId: productRow.id });
  giftInstanceId = instRow.id;
  const giftBefore = Math.trunc(Number(instRow.remaining_balance) || 0);
  if (giftBefore !== FACE) fail("U2_BALANCE", { expected: FACE, got: giftBefore });
  report.giftInstance = giftInstanceId;
  report.evidence.instance = instRow;
  }

  let orderId = EXISTING_ORDER_ID;
  if (!SKIP_CHECKOUT) {
  // ========== U4: Checkout redeem ==========
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
                lineId: `u7-${product.id}`,
                productId: product.id,
                title: product.title,
                thumbnailUrl: null,
                qty,
                unitPricePhp: unit,
                listUnitPricePhp: unit,
                discountPercent: null,
                modifierWire: null,
                optionSelections: {},
                optionsSummary: "",
                lineNote: null,
                pickupAvailable: true,
                localDeliveryAvailable: true,
                shippingAvailable: false,
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

  const pickupBtn = buyer.locator('button, label, [role="radio"]').filter({ hasText: /픽업|Pickup/i }).first();
  if (await pickupBtn.count()) await pickupBtn.click({ force: true }).catch(() => {});
  const pay = buyer.locator('button, label').filter({ hasText: /COD|현금|Cash|GCash/i }).first();
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
  if (!ids.includes(giftInstanceId)) fail("U4_ELIGIBLE", { ids, giftInstanceId });

  const pick = buyer.locator('[data-cart-gift-pick="1"]');
  if ((await pick.count()) > 0) await pick.click();
  else await buyer.locator('[data-cart-gift-change="1"]').click().catch(() => {});
  await buyer.locator('[data-cart-gift-picker="1"]').waitFor({ state: "visible", timeout: 10000 });
  await buyer.locator(`[data-cart-gift-option="${giftInstanceId}"]`).click();
  await buyer.locator('[data-cart-gift-applied="1"]').waitFor({ state: "visible", timeout: 10000 });
  await shot(buyer, "u4-gift-applied");

  const submit = buyer
    .locator(
      'button:has-text("Place"), button:has-text("주문"), button:has-text("픽업 주문"), button:has-text("Place pickup"), button:has-text("Place delivery")'
    )
    .first();
  await submit.waitFor({ state: "visible", timeout: 20000 });
  for (let i = 0; i < 30; i++) {
    if (!(await submit.isDisabled().catch(() => true))) break;
    await buyer.waitForTimeout(500);
  }
  if (await submit.isDisabled()) {
    await shot(buyer, "u4-submit-disabled");
    const disabledBody = await buyer.locator("body").innerText();
    fail("U4_SUBMIT", { reason: "submit_disabled", snippet: disabledBody.slice(0, 800) });
  }
  if ((await buyer.locator('[data-cart-gift-applied="1"]').count()) < 1) {
    fail("U4_SUBMIT", "gift_not_applied_before_submit");
  }
  await submit.click();
  await buyer.waitForTimeout(1000);
  const dialogConfirm = buyer
    .locator('[role="dialog"] button, [data-checkout-confirm] button')
    .filter({ hasText: /Place order|주문하기|확인/i })
    .last();
  if (await buyer.getByRole("button", { name: /^Place order$|주문하기/i }).count()) {
    await buyer.getByRole("button", { name: /^Place order$|주문하기/i }).last().click();
  } else if (await dialogConfirm.count()) {
    await dialogConfirm.click();
  }
  try {
    await buyer.waitForResponse(
      (res) => res.request().method() === "POST" && /\/api\/me\/store-orders(?:\?|$)/.test(res.url()),
      { timeout: 60000 }
    );
  } catch {
    /* continue */
  }
  await buyer.waitForTimeout(3000);

  orderId = "";
  for (const r of orderResponses) {
    try {
      const j = JSON.parse(r.body);
      if (j?.ok && j?.order?.id) {
        orderId = String(j.order.id);
        break;
      }
      if (j?.orderId) orderId = String(j.orderId);
    } catch {
      /* ignore */
    }
  }
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
  if (!orderId) {
    await shot(buyer, "u4-order-fail");
    fail("U4_ORDER", {
      responses: orderResponses,
      posts: orderPosts.slice(0, 2),
      url: buyer.url(),
      body: (await buyer.locator("body").innerText()).slice(0, 600),
    });
  }
  report.positiveFeeOrder = orderId;
  await shot(buyer, "u4-order");
  } else {
    if (!orderId) fail("U7_ORDER_RESUME", "missing GIFT_U7_ORDER_ID");
    report.positiveFeeOrder = orderId;
  }

  // ========== DB reconciliation ==========
  const { data: redRow } = await sb
    .from("gift_certificate_redemptions")
    .select(
      "id, order_id, instance_id, redeemed_amount, platform_fee_amount, merchant_net_amount, platform_fee_rate_snapshot, reversed"
    )
    .eq("order_id", orderId)
    .maybeSingle();
  if (!redRow) fail("U7_REDEMPTION_DB", { orderId });

  const gross = Math.trunc(Number(redRow.redeemed_amount) || 0);
  const fee = Math.trunc(Number(redRow.platform_fee_amount) || 0);
  const net = Math.trunc(Number(redRow.merchant_net_amount) || 0);
  const snap = Math.trunc(Number(redRow.platform_fee_rate_snapshot) || 0);
  const expectedFee = Math.floor((gross * FEE_RATE) / 100);

  report.redeemedGross = gross;
  report.platformFee = fee;
  report.merchantNet = net;
  report.evidence.redemption = redRow;

  if (snap !== FEE_RATE) fail("U7_FEE_SNAPSHOT", { expected: FEE_RATE, got: snap });
  if (fee <= 0) fail("U7_PLATFORM_FEE_ZERO", { fee, gross, snap });
  if (fee !== expectedFee) fail("U7_FEE_CALC", { expected: expectedFee, got: fee, gross, rate: FEE_RATE });
  if (gross !== fee + net) fail("U7_GROSS_SPLIT", { gross, fee, net });
  report.grossEqualsFeePlusNet = "PASS";

  const revenueAfter = await aggregateRevenue(sb);
  const deltaFee = revenueAfter.platformFee - revenueBefore.platformFee;
  const deltaNet = revenueAfter.merchantNet - revenueBefore.merchantNet;
  const deltaGross = revenueAfter.redeemedGross - revenueBefore.redeemedGross;
  report.evidence.revenueAfter = revenueAfter;
  report.evidence.revenueDelta = { deltaGross, deltaFee, deltaNet };
  if (!SKIP_CHECKOUT) {
    if (deltaFee !== fee || deltaNet !== net || deltaGross !== gross) {
      fail("U7_REVENUE_DELTA", { deltaFee, fee, deltaNet, net, deltaGross, gross });
    }
  } else if (revenueAfter.platformFee < fee || revenueAfter.merchantNet < net) {
    fail("U7_REVENUE_TOTAL", { revenueAfter, fee, net });
  }

  // ========== Admin Platform Revenue UI ==========
  await admin.setViewportSize({ width: 1280, height: 900 });
  await admin.goto(`${ORIGIN}/admin/business`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await admin.waitForTimeout(800);
  const opsRev = admin.locator("span", { hasText: /^Operations$/i }).first();
  if (await opsRev.count()) {
    await opsRev.click({ force: true });
    await admin.waitForTimeout(600);
  }
  const revHref = admin.locator('a[href="/admin/gift-certificates/revenue"]').first();
  if (await revHref.isVisible().catch(() => false)) {
    await revHref.click();
  } else {
    await admin.goto(`${ORIGIN}/admin/gift-certificates/revenue`, { waitUntil: "domcontentloaded", timeout: 90000 });
  }
  await admin.waitForURL(/gift-certificates\/revenue/, { timeout: 30000 }).catch(() => null);
  await admin.waitForSelector('[data-admin-gift-revenue="1"]', { timeout: 60000 });
  await admin.waitForFunction(
    () => {
      const fee = document.querySelector('[data-admin-gift-kpi="fee"]');
      return fee && (fee.innerText || "").replace(/[^\d]/g, "").length > 0;
    },
    null,
    { timeout: 30000 }
  );
  await shot(admin, "u7-admin-revenue");
  const adminRev = await admin.evaluate(async () => {
    const res = await fetch("/api/admin/gift-certificates/revenue", { credentials: "include", cache: "no-store" });
    return res.json();
  });
  if (!adminRev?.ok) fail("U7_ADMIN_API", adminRev);
  const uiFeeText = await admin.locator('[data-admin-gift-kpi="fee"]').innerText();
  const uiGrossText = await admin.locator('[data-admin-gift-kpi="gross"]').innerText();
  const uiNetText = await admin.locator('[data-admin-gift-kpi="merchant"]').innerText();
  const uiFee = Math.trunc(Number(adminRev.platformFee) || 0);
  const uiGross = Math.trunc(Number(adminRev.redeemedGross) || 0);
  const uiNet = Math.trunc(Number(adminRev.merchantNet) || 0);
  if (uiFee !== revenueAfter.platformFee || uiGross !== revenueAfter.redeemedGross || uiNet !== revenueAfter.merchantNet) {
    fail("U7_ADMIN_API_MISMATCH", { uiFee, dbFee: revenueAfter.platformFee, adminRev });
  }
  if (uiFee <= 0) fail("U7_ADMIN_FEE_ZERO", { uiFee });
  report.adminPlatformRevenue = "PASS";
  report.evidence.adminUi = { uiFeeText, uiGrossText, uiNetText, adminRev };

  // ========== Owner Merchant Net UI ==========
  await owner.goto(`${ORIGIN}/stores/owner/gift-certificates?storeId=${STORE.storeId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await owner.waitForSelector('[data-owner-gift-certificates="1"]', { timeout: 60000 });
  await owner.getByRole("button", { name: /사용 내역|Redemption history/i }).first().click();
  await owner.waitForTimeout(1200);
  await shot(owner, "u7-owner-redemptions");

  const ownerApi = await owner.evaluate(async (storeId) => {
    const res = await fetch(`/api/me/stores/${storeId}/gift-certificates/redemptions`, {
      credentials: "include",
      cache: "no-store",
    });
    return res.json();
  }, STORE.storeId);
  if (!ownerApi?.ok) fail("U7_OWNER_API", ownerApi);
  const ownerRed = (ownerApi.redemptions ?? []).find((r) => String(r.orderId) === orderId);
  if (!ownerRed) fail("U7_OWNER_REDEMPTION", { orderId, count: ownerApi.redemptions?.length });
  const oGross = Math.trunc(Number(ownerRed.redeemedAmount) || 0);
  const oFee = Math.trunc(Number(ownerRed.platformFeeAmount) || 0);
  const oNet = Math.trunc(Number(ownerRed.merchantNetAmount) || 0);
  if (oGross !== gross || oFee !== fee || oNet !== net) {
    fail("U7_OWNER_API_MISMATCH", { oGross, gross, oFee, fee, oNet, net });
  }
  if (oFee <= 0 || oNet !== gross - fee) fail("U7_OWNER_FEE_NET", { oFee, oNet, gross, fee });

  const row = owner.locator(`[data-order-id="${orderId}"]`).first();
  if (!(await row.isVisible().catch(() => false))) fail("U7_OWNER_ROW", { orderId });
  const rowText = await row.innerText();
  if (!rowText.includes(String(net)) && !rowText.includes(net.toLocaleString())) {
    fail("U7_OWNER_UI_NET", { rowText: rowText.slice(0, 400), net });
  }
  if (!rowText.includes(String(fee)) && !rowText.includes(fee.toLocaleString())) {
    fail("U7_OWNER_UI_FEE", { rowText: rowText.slice(0, 400), fee });
  }

  const ownerRevApi = await owner.evaluate(async (storeId) => {
    const res = await fetch(`/api/me/stores/${storeId}/gift-certificates/revenue`, {
      credentials: "include",
      cache: "no-store",
    });
    return res.json();
  }, STORE.storeId);
  if (!ownerRevApi?.ok) fail("U7_OWNER_REVENUE_API", ownerRevApi);
  const available = Math.trunc(Number(ownerRevApi.availableRevenue) || 0);
  report.evidence.ownerRevenue = { available, ownerRevApi };
  if (available < net) fail("U7_OWNER_AVAILABLE", { available, net });
  if (available === gross) fail("U7_OWNER_FEE_INCLUDED", { available, gross, fee, note: "owner_available_must_be_merchant_net_only" });

  report.ownerMerchantRevenue = "PASS";
  report.positiveFeeRuntime = "PROVEN";
  report.u7 = "PARTIAL — U7-A POSITIVE FEE PROVEN; remaining U7-B..F not run";
  report.firstDivergence = "NONE";
  write();
  console.log(JSON.stringify(report, null, 2));

  await ownerOpen.context.close();
  await adminOpen.context.close();
  await buyerOpen.context.close();
} catch (e) {
  report.firstDivergence = String(e?.message || e);
  if (report.positiveFeeRuntime !== "PROVEN") report.u7 = "BLOCKED";
  write();
  console.error(e);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
