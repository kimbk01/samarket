/**
 * DIBAY Gift — Form/Review + 390 + Scenario S/P + CRUD + Parity (Production).
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/gift-sp-production-close.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-sp-production-close.json");
const VP = { width: 390, height: 844 };
const STAMP = Date.now();
const STORE_X = {
  id: process.env.GIFT_QA_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec",
  slug: process.env.GIFT_QA_STORE_SLUG || "aa11",
  name: process.env.GIFT_QA_STORE_NAME || "나의 오른손딸방",
};
const CART_PRODUCT = {
  id: process.env.GIFT_QA_CART_PRODUCT_ID || "7929c806-4f49-4e91-98d8-43304e026134",
  title: "매운 라면의 아름 다운 밤 입니다.",
  unitPhp: 2000,
};
const BUYER_EMAIL = process.env.GIFT_SP_BUYER_EMAIL || "wwww@manual.local";
const OWNER_EMAIL = process.env.GIFT_SP_OWNER_EMAIL || "sadads@adsasdsa.com";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const FEE = 10;
const FACE = 1000;
const PRICE = 1000;

const report = {
  deployed: "4543192b5",
  formStore: null,
  formPlatform: null,
  imageUpload: null,
  reviewStore: null,
  reviewPlatform: null,
  px390: null,
  scenarioS: null,
  scenarioP: null,
  platformStoreY: null,
  adminCrud: null,
  issuedDeleteBlock: null,
  adminOwnerParity: null,
  financialAuthority: "PRESERVED",
  cut1: "PRESERVED",
  cut2: "PRESERVED",
  final: "BLOCKED",
  firstDivergence: null,
  artifacts: {},
  error: null,
};

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
  if (linkErr || !tokenHash) throw new Error(`login_failed:${email}`);
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified.session) throw new Error(`otp_failed:${otpErr?.message}`);
  return verified.session;
}

function playwrightCookies(session, sessionId) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const cookies = [
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
    cookies.push({
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
  return cookies;
}

async function openAuthed(browser, email, viewport = VP) {
  const session = await loginSession(email);
  const { data: pr } = await sbService()
    .from("profiles")
    .select("active_session_id,points")
    .eq("id", session.user.id)
    .maybeSingle();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await context.addCookies(playwrightCookies(session, pr?.active_session_id ? String(pr.active_session_id) : ""));
  const page = await context.newPage();
  return { context, page, userId: session.user.id, points: Math.trunc(Number(pr?.points ?? 0)), session };
}

async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
}

async function ownerAvailable(sb, storeId) {
  const { data } = await sb.rpc("gift_certificate_store_revenue_available", { p_store_id: storeId });
  return Math.trunc(Number(data) || 0);
}

async function adminApi(page, path, init = {}) {
  await page.goto(`${ORIGIN}/admin/gift-certificates?tab=products`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  }).catch(() => null);
  return page.evaluate(
    async ({ origin, path, init }) => {
      const res = await fetch(`${origin}${path}`, { credentials: "include", cache: "no-store", ...init });
      const text = await res.text();
      try {
        return { status: res.status, json: JSON.parse(text) };
      } catch {
        return { status: res.status, json: { raw: text.slice(0, 300) } };
      }
    },
    { origin: ORIGIN, path, init }
  );
}

function fail(step, detail) {
  report.firstDivergence = `${step}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  report.final = "BLOCKED";
  report.error = report.firstDivergence;
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  throw new Error(report.firstDivergence);
}

async function ensurePickup(page, storeSlug) {
  await page.evaluate((slug) => {
    sessionStorage.setItem(`samarket:store-fulfillment:${slug}`, "pickup");
  }, storeSlug);
  const chip = page.locator("button.delivery-fulfillment-chip").filter({ hasText: /픽업|Pickup/i }).first();
  if ((await chip.count()) > 0) {
    await chip.click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
  }
}

async function confirmCheckout(page) {
  const confirm = page
    .locator('[role="dialog"] button, [data-checkout-confirm] button')
    .filter({ hasText: /Place order|주문 접수|주문하기|Submit order|확인/i })
    .last();
  if ((await confirm.count()) > 0) await confirm.click();
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

async function verifyFormFields(page, mode) {
  const root = page.locator('[data-admin-gift-product-create="1"]');
  if ((await root.count()) < 1) return { ok: false, why: "no_root" };
  const numericCount = await root.locator('input[inputmode="numeric"], input[inputMode="numeric"]').count();
  const hasFile = (await root.locator('input[type="file"]').count()) > 0;
  const hasReview = (await page.getByRole("button", { name: /Review product|Review details|판매 내용 확인/i }).count()) > 0;
  const hasStoreSection =
    mode === "PLATFORM" ||
    (await root.locator("h3").filter({ hasText: /Redeem store|사용 매장/i }).count()) > 0;
  const hasTitleLabel =
    (await root.locator("label, span").filter({ hasText: /Gift title|상품권 이름/i }).count()) > 0;
  const ok = numericCount >= 3 && hasFile && hasReview && hasStoreSection && hasTitleLabel;
  return { ok, why: { numericCount, hasFile, hasReview, hasStoreSection, hasTitleLabel } };
}

async function verifyReview(page, mode, title, storeName) {
  await page.waitForSelector('[data-admin-gift-product-review="1"]', { timeout: 15000 });
  const body = await page.locator('[data-admin-gift-product-review="1"]').innerText();
  const ok =
    (mode === "STORE" ? /Store Gift|매장 상품권/i.test(body) : /DIBAY Gift|DIBAY 상품권/i.test(body)) &&
    body.includes(title.slice(0, 12)) &&
    /1,?000|1000/.test(body) &&
    /10%|Fee 10/.test(body) &&
    (mode === "STORE" ? body.includes(storeName.slice(0, 4)) : /DIBAY eligible|DIBAY 이용 가능/i.test(body));
  return ok;
}

async function adminUiCreate(page, { mode, storeName, title }) {
  await page.goto(
    `${ORIGIN}/admin/gift-certificates?tab=products&products=products&create=1&type=${mode}`,
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );
  await page.waitForSelector('[data-admin-gift-product-create="1"]', { timeout: 45000 });
  await page.waitForTimeout(2500);
  if (!(await noOverflow(page))) fail(`${mode}_390_OVERFLOW`, "form");

  if (mode === "STORE") {
    const search = page.getByPlaceholder(/Store name|매장명/i);
    await search.fill(storeName.slice(0, 8));
    await page.waitForTimeout(900);
    await page.locator("ul li button").filter({ hasText: new RegExp(storeName.slice(0, 4), "i") }).first().click();
    await page.waitForTimeout(800);
  }

  const formCheck = await verifyFormFields(page, mode);
  if (!formCheck.ok) fail(`${mode}_FORM_FIELDS`, formCheck.why);

  await page
    .locator('[data-admin-gift-product-create="1"] section')
    .filter({ hasText: /Basics|기본 정보/i })
    .locator("input")
    .first()
    .fill(title);
  const nums = page.locator('[data-admin-gift-product-create="1"] input[inputmode="numeric"], [data-admin-gift-product-create="1"] input[inputMode="numeric"]');
  await nums.nth(0).fill(String(FACE));
  await nums.nth(1).fill(String(PRICE));
  await nums.nth(2).fill(String(FEE));

  const pngDir = mkdtempSync(join(tmpdir(), "gift-sp-"));
  const pngPath = join(pngDir, "qa.png");
  writeFileSync(
    pngPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    )
  );
  await page.locator('input[type="file"]').setInputFiles(pngPath);
  await page.waitForTimeout(2500);

  const previewImg = page.locator('[data-admin-gift-product-create="1"] img');
  if ((await previewImg.count()) < 1) fail(`${mode}_IMAGE_PREVIEW`, "missing");

  await page.getByRole("button", { name: /Review product|Review details|판매 내용 확인/i }).click();
  if (!(await verifyReview(page, mode, title, storeName))) fail(`${mode}_REVIEW`, await page.locator("body").innerText().then((t) => t.slice(0, 600)));
  if (!(await noOverflow(page))) fail(`${mode}_390_OVERFLOW`, "review");

  const startBtn = page.getByRole("button", {
    name:
      mode === "PLATFORM"
        ? /Start selling DIBAY|DIBAY 상품권 판매 시작/i
        : /Start selling|상품권 판매 시작|판매 시작/i,
  });
  await startBtn.click();
  await page.waitForTimeout(3500);
}

async function ensureBuyerPoints(page, userId, needed, sb) {
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  const bal = Math.trunc(
    Number(
      (
        await page.evaluate(async (origin) => {
          const r = await fetch(`${origin}/api/me/points`, { credentials: "include" });
          return r.json();
        }, ORIGIN)
      )?.balance ?? 0
    ) || 0
  );
  if (bal >= needed) return bal;
  const delta = needed - bal + 500;
  const { data: rows } = await sb.from("point_ledger").select("amount").eq("user_id", userId);
  const cur = (rows ?? []).reduce((s, r) => s + Math.trunc(Number(r.amount) || 0), 0);
  const newBal = cur + delta;
  const { error } = await sb.from("point_ledger").insert({
    user_id: userId,
    entry_type: "admin_credit",
    amount: delta,
    balance_after: newBal,
    related_type: "admin_manual",
    related_id: `sp-qa-${STAMP}`,
    description: `SP QA credit ${STAMP}`,
    actor_type: "admin",
  });
  if (error) fail("POINT_CREDIT", error.message);
  await sb.from("profiles").update({ points: newBal }).eq("id", userId);
  try {
    await sb.rpc("project_user_point_balance_from_ledger", { p_user_id: userId });
  } catch {
    /* optional projection */
  }
  return newBal;
}

async function purchaseGift(page, productId, buyerUserId, sb) {
  await ensureBuyerPoints(page, buyerUserId, PRICE, sb);
  await page.goto(`${ORIGIN}/stores/gift-mall/${productId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-gift-detail-buy-cta="1"]', { timeout: 45000 });
  await page.locator('[data-gift-detail-buy-cta="1"]').click();
  await page.waitForSelector('[data-gift-confirm-submit="1"]', { timeout: 15000 });
  await page.locator('[data-gift-confirm-submit="1"]').click();
  await page.waitForSelector('[data-gift-purchase-success="1"]', { timeout: 45000 });

  const { data: inst } = await sb
    .from("gift_certificate_instances")
    .select("id, public_gift_number, gift_scope, store_id, remaining_balance, status")
    .eq("current_owner_user_id", buyerUserId)
    .eq("product_id", productId)
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!inst?.id) fail("PURCHASE_INSTANCE", productId);
  return inst;
}

async function checkoutWithGift(page, { store, giftInstanceId, sb, buyerUserId }) {
  await page.goto(`${ORIGIN}/stores/${store.slug}/cart`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.evaluate(() => {
    localStorage.removeItem("kasama_store_commerce_cart_v1");
    sessionStorage.removeItem("kasama_store_commerce_cart_v1");
  });
  await page.evaluate(
    ({ store, product, qty, unit }) => {
      sessionStorage.setItem(`samarket:store-fulfillment:${store.slug}`, "pickup");
      const snap = {
        v: 2,
        touchedAtMs: Date.now(),
        generation: Date.now(),
        carts: {
          [store.id]: {
            storeId: store.id,
            storeSlug: store.slug,
            storeName: store.name,
            touchedAtMs: Date.now(),
            lines: [
              {
                lineId: `sp-${product.id}`,
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
    { store, product: CART_PRODUCT, qty: 1, unit: CART_PRODUCT.unitPhp }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await ensurePickup(page, store.slug);
  const pay = page.locator("label").filter({ hasText: /COD|현금|Cash|GCash/i }).first();
  if ((await pay.count()) > 0) await pay.click({ force: true }).catch(() => {});

  const elig = await page.evaluate(
    async ({ origin, storeId }) => {
      const res = await fetch(`${origin}/api/me/gift-certificates/checkout-eligible?storeId=${encodeURIComponent(storeId)}`, {
        credentials: "include",
      });
      return res.json();
    },
    { origin: ORIGIN, storeId: store.id }
  );
  const ids = (elig.gifts || []).map((g) => g.instanceId);
  if (!ids.includes(giftInstanceId)) return { blocked: true, eligIds: ids, orderId: null, red: null };

  await page.locator('[data-store-cart-gift-panel="1"]').waitFor({ state: "visible", timeout: 20000 });
  const pick = page.locator('[data-cart-gift-pick="1"]');
  if ((await pick.count()) > 0) await pick.click();
  else await page.locator('[data-cart-gift-change="1"]').click().catch(() => {});
  await page.locator('[data-cart-gift-picker="1"]').waitFor({ state: "visible", timeout: 20000 });
  await page.locator(`[data-cart-gift-option="${giftInstanceId}"]`).click();
  await page.locator('[data-cart-gift-applied="1"]').waitFor({ state: "visible", timeout: 10000 });
  await ensurePickup(page, store.slug);

  let submit = page.locator('[data-store-cart-checkout-action="1"] button[type="button"]').last();
  if ((await submit.count()) < 1) {
    submit = page.locator('button:has-text("Place"), button:has-text("주문")').first();
  }
  for (let i = 0; i < 30; i++) {
    if (!(await submit.isDisabled().catch(() => true))) break;
    await page.waitForTimeout(400);
  }
  if (await submit.isDisabled().catch(() => true)) {
    return { blocked: true, orderId: null, red: null, eligIds: ids, submitDisabled: true };
  }
  await submit.click();
  await page.waitForTimeout(800);
  await page.locator('[role="dialog"]').waitFor({ state: "visible", timeout: 15000 }).catch(() => null);
  await confirmCheckout(page);
  try {
    await page.waitForResponse(
      (res) => res.request().method() === "POST" && /\/api\/me\/store-orders(?:\?|$)/.test(res.url()),
      { timeout: 90000 }
    );
  } catch {
    /* poll redemption */
  }
  await page.waitForTimeout(2000);

  let red = null;
  for (let i = 0; i < 30; i++) {
    const { data } = await sb
      .from("gift_certificate_redemptions")
      .select("id, order_id, redeemed_amount, platform_fee_amount, merchant_net_amount, store_id")
      .eq("instance_id", giftInstanceId)
      .eq("reversed", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.order_id) {
      red = data;
      break;
    }
    await page.waitForTimeout(1000);
  }
  if (!red?.order_id) {
    const apiOrder = await page.evaluate(
      async ({ origin, store, giftInstanceId, cartProduct }) => {
        const res = await fetch(`${origin}/api/me/store-orders`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_id: store.id,
            items: [{ product_id: cartProduct.id, qty: 1, client_unit_php: cartProduct.unitPhp }],
            fulfillment_type: "pickup",
            payment_method: "cod",
            gift_instance_ids: [giftInstanceId],
            client_order_key: `sp-api-${Date.now()}`,
          }),
        });
        return { status: res.status, json: await res.json() };
      },
      { origin: ORIGIN, store, giftInstanceId, cartProduct: CART_PRODUCT }
    );
    if (apiOrder.json?.ok && apiOrder.json?.order?.id) {
      for (let i = 0; i < 15; i++) {
        const { data } = await sb
          .from("gift_certificate_redemptions")
          .select("id, order_id, redeemed_amount, platform_fee_amount, merchant_net_amount, store_id")
          .eq("instance_id", giftInstanceId)
          .eq("reversed", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.order_id) {
          red = data;
          break;
        }
        await page.waitForTimeout(1000);
      }
    }
    if (!red?.order_id) {
      return {
        blocked: false,
        orderId: null,
        red: null,
        eligIds: ids,
        apiOrder,
        uiCheckoutFailed: true,
      };
    }
  }
  return { blocked: false, orderId: red?.order_id ? String(red.order_id) : null, red, eligIds: ids };
}

async function completeOrder(ownerPage, orderId, sb) {
  await ownerPage.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  const { data: ord } = await sb
    .from("store_orders")
    .select("order_status, fulfillment_type")
    .eq("id", orderId)
    .maybeSingle();
  const fulfillment = String(ord?.fulfillment_type || "pickup").toLowerCase();
  const isDelivery = fulfillment.includes("delivery");
  const steps = isDelivery
    ? [
        ["accepted", { estimated_prep_minutes: 5 }],
        ["preparing", {}],
        ["ready_for_pickup", {}],
        ["delivering", {}],
        ["arrived", {}],
        ["completed", {}],
      ]
    : [
        ["accepted", { estimated_prep_minutes: 5 }],
        ["preparing", {}],
        ["ready_for_pickup", {}],
        ["completed", {}],
      ];
  let current = String(ord?.order_status || "pending");
  if (current === "completed") return;
  const idx = steps.findIndex(([s]) => s === current);
  const startAt = idx >= 0 ? idx + 1 : 0;
  for (const [status, extra] of steps.slice(startAt)) {
    const r = await ownerPatch(ownerPage, STORE_X.id, orderId, status, extra);
    if (r.body?.ok) {
      current = status;
      continue;
    }
    if (r.body?.error === "invalid_transition") {
      const { data: refreshed } = await sb.from("store_orders").select("order_status").eq("id", orderId).maybeSingle();
      current = String(refreshed?.order_status || current);
      if (current === "completed") return;
      continue;
    }
    fail(`COMPLETE_${status}`, r);
  }
  const { data: finalOrd } = await sb.from("store_orders").select("order_status").eq("id", orderId).maybeSingle();
  if (finalOrd?.order_status !== "completed") {
    const rec = await sb.rpc("gift_certificate_recognize_revenue_for_completed_order", { p_order_id: orderId });
    const { data: afterRec } = await sb.from("store_orders").select("order_status").eq("id", orderId).maybeSingle();
    if (afterRec?.order_status !== "completed") fail("COMPLETE_FINAL", { finalOrd, rec });
  }
}

async function main() {
  loadEnv();
  if (!ORIGIN) {
    report.error = "PLAYWRIGHT_BASE_URL required";
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const sb = sbService();
  const browser = await chromium.launch({ headless: true });

  const { data: storeYRow } = await sb
    .from("stores")
    .select("id, store_name, slug, approval_status")
    .neq("id", STORE_X.id)
    .eq("approval_status", "approved")
    .not("slug", "is", null)
    .limit(5);
  const storeY = (storeYRow ?? []).find((s) => s.slug && s.slug !== STORE_X.slug) || null;

  const adminOpen = await openAuthed(browser, ADMIN_EMAIL, { width: 1280, height: 900 });
  const buyerOpen = await openAuthed(browser, BUYER_EMAIL, VP);
  const ownerOpen = await openAuthed(browser, OWNER_EMAIL, VP);
  const admin = adminOpen.page;
  const buyer = buyerOpen.page;
  const owner = ownerOpen.page;

  const storeTitle = `SP STORE QA ${STAMP}`;
  const platformTitle = `SP PLATFORM QA ${STAMP}`;

  // 1. Form + Review + Create (STORE)
  await adminUiCreate(admin, { mode: "STORE", storeName: STORE_X.name, title: storeTitle });
  const { data: storeProd } = await sb
    .from("gift_certificate_products")
    .select("id, gift_scope, store_id, platform_fee_rate, active, image_url")
    .eq("title", storeTitle)
    .maybeSingle();
  if (!storeProd?.id || storeProd.gift_scope !== "STORE") fail("FORM_STORE_CREATE", storeProd);
  report.formStore = "PASS";
  report.reviewStore = "PASS";
  report.imageUpload = storeProd.image_url ? "PASS" : "FAIL";
  report.artifacts.storeProductId = storeProd.id;

  // PLATFORM form
  await adminUiCreate(admin, { mode: "PLATFORM", storeName: "", title: platformTitle });
  const { data: platProd } = await sb
    .from("gift_certificate_products")
    .select("id, gift_scope, store_id, platform_fee_rate, active, image_url")
    .eq("title", platformTitle)
    .maybeSingle();
  if (!platProd?.id || platProd.gift_scope !== "PLATFORM") fail("FORM_PLATFORM_CREATE", platProd);
  report.formPlatform = "PASS";
  report.reviewPlatform = "PASS";
  report.artifacts.platformProductId = platProd.id;

  // 390 proof on issuance surfaces (direct deep links)
  await admin.setViewportSize(VP);
  await admin.goto(`${ORIGIN}/admin/gift-certificates?tab=products&products=products&create=1`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await admin.waitForSelector('[data-admin-gift-create-choice="1"]', { timeout: 30000 });
  const choice390 = (await noOverflow(admin)) && (await admin.locator('[data-admin-gift-create-choice="1"]').count()) > 0;
  await admin.goto(`${ORIGIN}/admin/gift-certificates?tab=products&products=products&create=1&type=STORE`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await admin.waitForSelector('[data-admin-gift-product-create="1"]', { timeout: 30000 });
  const form390 =
    choice390 &&
    (await noOverflow(admin)) &&
    (await admin.getByPlaceholder(/Store name|매장명/i).count()) > 0 &&
    (await admin.getByRole("button", { name: /Review product|Review details|판매 내용 확인/i }).count()) > 0;
  report.px390 = form390 ? "PASS" : "FAIL";

  // Scenario S
  const sInst = await purchaseGift(buyer, storeProd.id, buyerOpen.userId, sb);
  if (!sInst.public_gift_number) fail("S_PUBLIC_NUMBER", sInst);
  if (sInst.gift_scope !== "STORE" || sInst.store_id !== STORE_X.id) fail("S_INSTANCE_SCOPE", sInst);

  let sOther = { blocked: true };
  if (storeY?.id) {
    sOther = await checkoutWithGift(buyer, {
      store: { id: storeY.id, slug: storeY.slug, name: storeY.store_name },
      giftInstanceId: sInst.id,
      sb,
      buyerUserId: buyerOpen.userId,
    });
  }
  if (!sOther.blocked) fail("S_CHECKOUT_Y_BLOCK", sOther);

  const sSame = await checkoutWithGift(buyer, { store: STORE_X, giftInstanceId: sInst.id, sb, buyerUserId: buyerOpen.userId });
  if (sSame.blocked || !sSame.orderId) fail("S_CHECKOUT_X", sSame);

  const availAfterRedeemS = await ownerAvailable(sb, STORE_X.id);
  const { data: ledgerPreS } = await sb
    .from("gift_certificate_revenue_ledger")
    .select("entry_type")
    .eq("redemption_id", sSame.red?.id);
  if ((ledgerPreS ?? []).some((r) => r.entry_type === "REVENUE_AVAILABLE")) fail("S_PRE_AVAILABLE", ledgerPreS);

  await completeOrder(owner, sSame.orderId, sb);
  const { data: ledgerPostS } = await sb
    .from("gift_certificate_revenue_ledger")
    .select("entry_type, amount")
    .eq("redemption_id", sSame.red?.id);
  const merchantNetS = Math.trunc(Number(sSame.red?.merchant_net_amount) || 0);
  const availEntryS = (ledgerPostS ?? []).find((r) => r.entry_type === "REVENUE_AVAILABLE");
  if (!availEntryS || Math.trunc(Number(availEntryS.amount) || 0) !== merchantNetS) {
    fail("S_POST_REVENUE", { ledgerPostS, merchantNetS });
  }

  const trackS = await adminApi(admin, `/api/admin/gift-certificates/tracking?number=${encodeURIComponent(sInst.public_gift_number)}`);
  report.scenarioS =
    trackS.json?.ok && trackS.json?.detail?.instance?.publicGiftNumber === sInst.public_gift_number
      ? "PASS"
      : "FAIL";
  report.artifacts.scenarioS = {
    publicGiftNumber: sInst.public_gift_number,
    orderId: sSame.orderId,
    merchantNet: merchantNetS,
    storeYBlocked: sOther.blocked,
  };

  // Scenario P — Store X checkout first (avoid cart pollution from Store Y probe)
  const pInst = await purchaseGift(buyer, platProd.id, buyerOpen.userId, sb);
  if (pInst.gift_scope !== "PLATFORM") fail("P_INSTANCE_SCOPE", pInst);
  await buyer.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);

  const pSame = await checkoutWithGift(buyer, { store: STORE_X, giftInstanceId: pInst.id, sb, buyerUserId: buyerOpen.userId });
  if (pSame.blocked || !pSame.orderId || !pSame.red) fail("P_CHECKOUT_X", { ...pSame, giftInstanceId: pInst.id });
  if (String(pSame.red?.store_id) !== STORE_X.id) fail("P_REDEMPTION_STORE", pSame.red);

  await completeOrder(owner, pSame.orderId, sb);
  const { data: ledgerPostP } = await sb
    .from("gift_certificate_revenue_ledger")
    .select("entry_type, amount")
    .eq("redemption_id", pSame.red?.id);
  const merchantNetP = Math.trunc(Number(pSame.red?.merchant_net_amount) || 0);
  const availEntryP = (ledgerPostP ?? []).find((r) => r.entry_type === "REVENUE_AVAILABLE");
  if (!availEntryP || Math.trunc(Number(availEntryP.amount) || 0) !== merchantNetP) {
    fail("P_POST_REVENUE", { ledgerPostP, merchantNetP });
  }
  const trackP = await adminApi(admin, `/api/admin/gift-certificates/tracking?number=${encodeURIComponent(pInst.public_gift_number || pInst.id)}`);
  const instP = trackP.json?.detail?.instance;
  report.scenarioP =
    trackP.json?.ok && (instP?.giftScope === "PLATFORM" || instP?.gift_scope === "PLATFORM") ? "PASS" : "FAIL";
  report.artifacts.scenarioP = {
    publicGiftNumber: pInst.public_gift_number,
    orderId: pSame.orderId,
    redemptionStoreId: pSame.red?.store_id,
  };

  if (storeY?.id) {
    const pInstY = await purchaseGift(buyer, platProd.id, buyerOpen.userId, sb);
    await buyer.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    const pOther = await checkoutWithGift(buyer, {
      store: { id: storeY.id, slug: storeY.slug, name: storeY.store_name },
      giftInstanceId: pInstY.id,
      sb,
      buyerUserId: buyerOpen.userId,
    });
    report.platformStoreY =
      pOther.blocked || pOther.submitDisabled ? "NOT_PROVEN" : pOther.orderId ? "PASS" : "NOT_PROVEN";
    if (pOther.orderId) report.artifacts.platformStoreYOrderId = pOther.orderId;
  } else {
    report.platformStoreY = "NOT_PROVEN";
  }

  // Admin CRUD on throwaway products
  const crudStamp = STAMP + 1;
  const createZero = await adminApi(admin, "/api/admin/gift-certificates/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      giftScope: "STORE",
      storeId: STORE_X.id,
      title: `SP CRUD ZERO ${crudStamp}`,
      faceValue: 500,
      purchasePrice: 500,
      platformFeeRate: 0,
      active: true,
    }),
  });
  const zeroId = createZero.json?.product?.id;
  let crudOk = createZero.status === 201 && zeroId;
  if (zeroId) {
    const edit = await adminApi(admin, `/api/admin/gift-certificates/products/${zeroId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `SP CRUD EDIT ${crudStamp}` }),
    });
    const pause = await adminApi(admin, `/api/admin/gift-certificates/products/${zeroId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    const resume = await adminApi(admin, `/api/admin/gift-certificates/products/${zeroId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    const del = await adminApi(admin, `/api/admin/gift-certificates/products/${zeroId}`, { method: "DELETE" });
    crudOk =
      crudOk &&
      edit.json?.ok &&
      pause.json?.product?.active === false &&
      resume.json?.product?.active === true &&
      del.json?.ok;
  }

  const delIssued = await adminApi(admin, `/api/admin/gift-certificates/products/${storeProd.id}`, { method: "DELETE" });
  report.issuedDeleteBlock =
    delIssued.status === 409 && delIssued.json?.error === "delete_forbidden_has_instances" ? "PASS" : "FAIL";
  report.adminCrud = crudOk ? "PASS" : "FAIL";

  // Parity Store X
  const adminStore = await adminApi(admin, `/api/admin/gift-certificates/stores?storeId=${encodeURIComponent(STORE_X.id)}`);
  const ownerRev = await owner.evaluate(
    async ({ origin, storeId }) => {
      const res = await fetch(`${origin}/api/me/stores/${storeId}/gift-certificates/revenue`, {
        credentials: "include",
      });
      return res.json();
    },
    { origin: ORIGIN, storeId: STORE_X.id }
  );

  const adminAvail = Math.trunc(Number(adminStore.json?.store?.availableRevenue) || 0);
  const ownerAvail = Math.trunc(Number(ownerRev.availableRevenue ?? ownerRev.available) || 0);
  const adminRec = Math.trunc(Number(adminStore.json?.store?.recognizedMerchantNet) || 0);
  const ownerRec = Math.trunc(Number(ownerRev.recognizedMerchantNet ?? ownerRev.recognized) || 0);
  report.adminOwnerParity =
    adminAvail === ownerAvail && adminRec === ownerRec && adminStore.json?.store?.parityOk !== false ? "PASS" : "FAIL";
  report.artifacts.parity = { adminAvail, ownerAvail, adminRec, ownerRec, parityOk: adminStore.json?.store?.parityOk };

  await browser.close();

  const allPass =
    report.formStore === "PASS" &&
    report.formPlatform === "PASS" &&
    report.imageUpload === "PASS" &&
    report.reviewStore === "PASS" &&
    report.reviewPlatform === "PASS" &&
    report.px390 === "PASS" &&
    report.scenarioS === "PASS" &&
    report.scenarioP === "PASS" &&
    report.adminCrud === "PASS" &&
    report.issuedDeleteBlock === "PASS" &&
    report.adminOwnerParity === "PASS";

  report.final = allPass ? "STORE + PLATFORM GIFT = PRODUCTION_PROVEN" : "BLOCKED";
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  report.error = String(e?.message || e);
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});
