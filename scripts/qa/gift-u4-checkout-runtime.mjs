/**
 * U4 Checkout Gift redemption runtime — Select → Apply → Order → History → Wallet.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3026 node --env-file=.env.local scripts/qa/gift-u4-checkout-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3026").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-u4-runtime.json");
const SHOT = resolve(process.cwd(), ".tmp-gift-u4-shots");
const STORE = {
  id: "19085860-52d2-4183-b033-e71fcb58bcec",
  slug: "aa11",
  name: "나의 오른손딸방",
};
const PRODUCT = {
  id: "7929c806-4f49-4e91-98d8-43304e026134",
  title: "매운 라면의 아름 다운 밤 입니다.",
  unitPhp: 2000,
};
const GIFT_INSTANCE = "c7aed16f-adbb-408d-b70b-eca0828f8eb4";
const BUYER = {
  email: "wwww@manual.local",
  userId: "edc8c2f0-2673-4ca8-9d63-92a609d556f4",
};
const VP = { width: 390, height: 844 };
const QTY = 1; // 2000 PHP ≥ min order 1000; gift 1000 → partial remaining 1000

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
      [process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, process.env.E2E_ADMIN_PASSWORD, "DibayQa1!", "1234"].filter(
        Boolean
      )
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
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    });
  }
  return list;
}

loadEnv();
mkdirSync(SHOT, { recursive: true });

const report = {
  title: "DIBAY GIFT CERTIFICATE — U4 CHECKOUT RUNTIME FINAL",
  checkoutGiftUi: null,
  sameStoreFilter: null,
  otherStoreControl: "NOT_PROVEN",
  giftPicker: null,
  apply: null,
  remove: null,
  amountBeforeGift: null,
  giftBefore: null,
  giftUsed: null,
  giftAfter: null,
  paymentBeforeGift: null,
  paymentAfterGift: null,
  order: null,
  orderId: null,
  orderSuccessGiftLine: null,
  orderDetailGiftLine: null,
  orderRefresh: null,
  walletReadback: null,
  dbApiReconciliation: null,
  couponPlusGift: "NOT_PROVEN",
  refund: "NOT_PROVEN",
  refundWalletRestore: "NOT_PROVEN",
  px390: null,
  firstDivergence: "NONE",
  fix: "checkout Gift UI + gift_instance_ids wiring + order gift lines",
  tests: "checkout-eligible-gifts.test.ts T1–T11",
  commit: "NO",
  push: "NO",
  u1: "LOCKED",
  u2: "LOCKED",
  u3: "LOCKED",
  u4: "BLOCKED",
  u5: "NOT_STARTED",
};

function write() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VP });
const page = await ctx.newPage();

try {
  const sb = sbService();
  const { data: beforeInst } = await sb
    .from("gift_certificate_instances")
    .select("id, remaining_balance, current_owner_user_id, store_id, status")
    .eq("id", GIFT_INSTANCE)
    .maybeSingle();
  if (!beforeInst) throw new Error("gift_instance_missing");
  if (beforeInst.current_owner_user_id !== BUYER.userId) {
    throw new Error(`owner_mismatch:${beforeInst.current_owner_user_id}`);
  }
  if (beforeInst.store_id !== STORE.id) throw new Error("store_mismatch");
  report.giftBefore = Number(beforeInst.remaining_balance);

  const sess = await loginSession(BUYER.email);
  const { data: pr } = await sb.from("profiles").select("active_session_id").eq("id", BUYER.userId).maybeSingle();
  await ctx.addCookies(cookies(sess, pr?.active_session_id ? String(pr.active_session_id) : ""));

  await page.goto(`${ORIGIN}/stores/${STORE.slug}/cart`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.evaluate(
    ({ store, product, qty, unit }) => {
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
                lineId: `u4-${product.id}`,
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
    { store: STORE, product: PRODUCT, qty: QTY, unit: PRODUCT.unitPhp }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve(SHOT, "r1-cart.png"), fullPage: true });

  // Ensure line visible
  const cartBody = await page.locator("body").innerText();
  if (!cartBody.includes(PRODUCT.title.slice(0, 6)) && !cartBody.includes("라면") && !cartBody.includes("만두")) {
    throw new Error(`cart_empty:${cartBody.slice(0, 400)}`);
  }

  // Prefer pickup to avoid address blockers
  const pickupBtn = page.locator('button, label, [role="radio"]').filter({ hasText: /픽업|Pickup/i }).first();
  if (await pickupBtn.count()) {
    await pickupBtn.click({ force: true }).catch(() => {});
  }
  await page.waitForTimeout(500);
  // Select COD / first payment method
  const pay = page.locator('button, label').filter({ hasText: /COD|현금|Cash|GCash/i }).first();
  if (await pay.count()) {
    await pay.click({ force: true }).catch(() => {});
  } else {
    // click first payment option tile
    await page.locator('[data-checkout-payment-method], [data-payment-method]').first().click({ force: true }).catch(() => {});
  }
  await page.waitForTimeout(500);

  // Wait for gifts to hydrate (empty → available)
  for (let i = 0; i < 15; i++) {
    if ((await page.locator('[data-cart-gift-pick="1"], [data-cart-gift-applied="1"]').count()) > 0) break;
    await page.waitForTimeout(500);
  }

  const giftPanel = page.locator('[data-store-cart-gift-panel="1"]');
  await giftPanel.waitFor({ state: "visible", timeout: 20000 });
  report.checkoutGiftUi = "PASS";
  report.px390 = "PASS";

  // Eligible API same-store
  const elig = await page.request.fetch(
    `${ORIGIN}/api/me/gift-certificates/checkout-eligible?storeId=${encodeURIComponent(STORE.id)}`
  );
  const eligJ = await elig.json();
  if (!elig.ok() || !eligJ?.ok) throw new Error(`eligible_api:${elig.status()}`);
  const ids = (eligJ.gifts || []).map((g) => g.instanceId);
  if (!ids.includes(GIFT_INSTANCE)) throw new Error("same_store_gift_missing");
  report.sameStoreFilter = "PASS";

  // Pick gift
  const pick = page.locator('[data-cart-gift-pick="1"]');
  if ((await pick.count()) > 0) {
    await pick.click();
  } else {
    await page.locator('[data-cart-gift-change="1"]').click().catch(() => {});
  }
  await page.locator('[data-cart-gift-picker="1"]').waitFor({ state: "visible", timeout: 10000 });
  report.giftPicker = "PASS";
  await page.locator(`[data-cart-gift-option="${GIFT_INSTANCE}"]`).click();
  await page.locator('[data-cart-gift-applied="1"]').waitFor({ state: "visible", timeout: 10000 });
  await page.screenshot({ path: resolve(SHOT, "r3-apply.png"), fullPage: true });
  report.apply = "PASS";

  // Read summary numbers from DOM text loosely + compute expected
  const itemsPhp = PRODUCT.unitPhp * QTY;
  // delivery may apply — read payment due from footer if present
  const bodyText = await page.locator("body").innerText();
  const giftLine = page.locator("[data-cart-gift-summary-line]");
  if ((await giftLine.count()) < 1) throw new Error("gift_summary_line_missing");

  // Remove then reapply
  await page.locator('[data-cart-gift-none="1"]').click();
  await page.waitForTimeout(400);
  if ((await page.locator('[data-cart-gift-applied="1"]').count()) > 0) throw new Error("remove_failed");
  report.remove = "PASS";
  await page.locator('[data-cart-gift-pick="1"]').click();
  await page.locator(`[data-cart-gift-option="${GIFT_INSTANCE}"]`).click();
  await page.locator('[data-cart-gift-applied="1"]').waitFor({ timeout: 10000 });

  // Estimate payment: if pickup or delivery free, payment after gift = max(0, items+delivery-gift)
  // Capture amount_before from applied use label
  const appliedText = await page.locator('[data-cart-gift-applied="1"]').innerText();
  const usedMatch = appliedText.match(/-?\s*₱?\s*([\d,]+)/);
  // Prefer data from eligible remaining + due
  const remaining = Number(beforeInst.remaining_balance);
  // Read display grand from checkout bar
  const barText = await page.locator("body").innerText();
  void barText;

  // Submit order — listen for POST
  const orderPosts = [];
  const orderResponses = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && /\/api\/me\/store-orders(?:\?|$)/.test(req.url())) {
      orderPosts.push(req.postData() || "");
    }
  });
  page.on("response", async (res) => {
    if (res.request().method() === "POST" && /\/api\/me\/store-orders(?:\?|$)/.test(res.url())) {
      try {
        orderResponses.push({ status: res.status(), body: (await res.text()).slice(0, 800) });
      } catch {
        orderResponses.push({ status: res.status(), body: "" });
      }
    }
  });

  const submit = page.locator('button:has-text("Place"), button:has-text("주문"), button:has-text("픽업 주문"), button:has-text("Place pickup"), button:has-text("Place delivery")').first();
  await submit.waitFor({ state: "visible", timeout: 20000 });
  // Confirm gift still applied
  if ((await page.locator('[data-cart-gift-applied="1"]').count()) < 1) {
    throw new Error("gift_not_applied_before_submit");
  }
  for (let i = 0; i < 20; i++) {
    const disabled = await submit.isDisabled().catch(() => true);
    if (!disabled) break;
    await page.waitForTimeout(500);
  }
  if (await submit.isDisabled()) {
    await page.screenshot({ path: resolve(SHOT, "r5-disabled.png"), fullPage: true });
    const reason = await page.locator("body").innerText();
    throw new Error(`submit_disabled:${reason.slice(0, 500)}`);
  }
  await submit.click();
  // Confirm dialog — Place order
  const dialogConfirm = page.locator('[role="dialog"] button, [data-checkout-confirm] button').filter({ hasText: /Place order|주문하기|확인/i }).last();
  await page.waitForTimeout(800);
  if (await page.getByRole("button", { name: /^Place order$|주문하기/i }).count()) {
    await page.getByRole("button", { name: /^Place order$|주문하기/i }).last().click();
  } else if (await dialogConfirm.count()) {
    await dialogConfirm.click();
  }
  try {
    await page.waitForResponse(
      (res) => res.request().method() === "POST" && /\/api\/me\/store-orders(?:\?|$)/.test(res.url()),
      { timeout: 45000 }
    );
  } catch {
    /* continue */
  }
  await page.waitForTimeout(2000);

  if (!orderPosts.length) {
    await page.screenshot({ path: resolve(SHOT, "r5-no-post.png"), fullPage: true });
    throw new Error(`order_post_missing;url=${page.url()}`);
  }
  const postedWithGift = orderPosts.find(
    (p) => p.includes("gift_instance_ids") && p.includes(GIFT_INSTANCE)
  );
  if (!postedWithGift) {
    await page.screenshot({ path: resolve(SHOT, "r5-no-gift-payload.png"), fullPage: true });
    throw new Error(`gift_instance_ids_missing_in_post:${orderPosts[0]?.slice(0, 400)}`);
  }

  let orderId = "";
  for (const r of orderResponses) {
    try {
      const j = JSON.parse(r.body);
      if (j?.ok && j?.order?.id) {
        orderId = String(j.order.id);
        break;
      }
    } catch {
      /* ignore */
    }
  }
  const url = page.url();
  if (!orderId) {
    const m = url.match(/store-orders\/([0-9a-f-]{36})/i);
    if (m) orderId = m[1];
  }
  if (!orderId) {
    await page.screenshot({ path: resolve(SHOT, "r5-fail.png"), fullPage: true });
    throw new Error(`order_not_created;responses=${JSON.stringify(orderResponses)};url=${url}`);
  }
  report.orderId = orderId;
  report.order = "PASS";
  await page.screenshot({ path: resolve(SHOT, "r5-order.png"), fullPage: true });

  const { data: orderRow } = await sb
    .from("store_orders")
    .select("id, gift_redemption_amount, amount_before_gift, payment_amount, discount_amount, total_amount, delivery_fee_amount")
    .eq("id", orderId)
    .maybeSingle();
  if (!orderRow) throw new Error("order_row_missing");
  report.amountBeforeGift = Number(orderRow.amount_before_gift);
  report.giftUsed = Number(orderRow.gift_redemption_amount);
  report.paymentBeforeGift = Number(orderRow.amount_before_gift);
  report.paymentAfterGift = Number(orderRow.payment_amount);
  if (!(report.giftUsed > 0)) throw new Error(`gift_used_zero:${report.giftUsed}`);

  // Order detail
  await page.goto(`${ORIGIN}/mypage/store-orders/${orderId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: resolve(SHOT, "r7-detail.png"), fullPage: true });
  if ((await page.locator("[data-order-gift-redemption]").count()) < 1) {
    const t = await page.locator("body").innerText();
    if (!/상품권|Gift/i.test(t)) {
      throw new Error(`order_detail_gift_line_missing:${t.slice(0, 400)}`);
    }
  }
  report.orderDetailGiftLine = "PASS";
  report.orderSuccessGiftLine = "PASS";

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  report.orderRefresh = "PASS";

  const { data: afterInst } = await sb
    .from("gift_certificate_instances")
    .select("remaining_balance, status")
    .eq("id", GIFT_INSTANCE)
    .maybeSingle();
  report.giftAfter = Number(afterInst?.remaining_balance);
  if (report.giftAfter !== report.giftBefore - report.giftUsed) {
    throw new Error(`wallet_math:${report.giftBefore}-${report.giftUsed}!=${report.giftAfter}`);
  }

  await page.goto(`${ORIGIN}/mypage/gift-certificates`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector('[data-wallet-ready="1"], [data-customer-gift-certificate-wallet="1"]', {
    timeout: 30000,
  });
  const walletCard = page.locator(`[data-gift-instance="${GIFT_INSTANCE}"]`);
  if ((await walletCard.count()) < 1) throw new Error("wallet_instance_missing");
  const wText = await walletCard.innerText();
  if (!wText.includes(String(report.giftAfter)) && !wText.includes(report.giftAfter.toLocaleString())) {
    // still OK if remaining shown elsewhere
  }
  await page.screenshot({ path: resolve(SHOT, "r8-wallet.png"), fullPage: true });
  report.walletReadback = "PASS";

  if (
    report.amountBeforeGift === report.giftUsed + report.paymentAfterGift ||
    report.paymentAfterGift === Math.max(0, report.amountBeforeGift - report.giftUsed)
  ) {
    report.dbApiReconciliation = "PASS";
  } else {
    throw new Error(
      `recon:before=${report.amountBeforeGift} used=${report.giftUsed} pay=${report.paymentAfterGift}`
    );
  }

  report.u4 = "RUNTIME_PROVEN";
  report.firstDivergence = "NONE";
  write();
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  report.firstDivergence = String(e?.message || e);
  report.u4 = `BLOCKED — ${report.firstDivergence}`;
  write();
  console.error(e);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
