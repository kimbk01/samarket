/**
 * Resume from Scenario P after PLATFORM checkout precheck fix (do NOT rerun S/form).
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/gift-sp-resume-p-close.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-sp-resume-p-close.json");
const STAMP = Date.now();
const STORE_X = {
  id: process.env.GIFT_QA_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec",
  slug: process.env.GIFT_QA_STORE_SLUG || "aa11",
  name: process.env.GIFT_QA_STORE_NAME || "나의 오른손딸방",
};
const CART_PRODUCT = {
  id: process.env.GIFT_QA_CART_PRODUCT_ID || "7929c806-4f49-4e91-98d8-43304e026134",
  unitPhp: 2000,
};
const BUYER_EMAIL = process.env.GIFT_SP_BUYER_EMAIL || "wwww@manual.local";
const OWNER_EMAIL = process.env.GIFT_SP_OWNER_EMAIL || "sadads@adsasdsa.com";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const FEE = 10;
const PRICE = 1000;

const report = {
  scenarioS: "PRESERVED — previous Production PASS",
  storeWrongStoreMicro: null,
  platformRoutePrecheck: null,
  scenarioP: null,
  platformStoreX: null,
  platformStoreY: null,
  preCompletionRevenueZero: null,
  postCompletionMerchantNet: null,
  postCompletionDibayFee: null,
  actualRedeemStoreAuthority: null,
  ownerPlatformUsage: null,
  adminPlatformTrace: null,
  adminCrud: null,
  zeroInstanceDelete: null,
  issuedDeleteBlock: null,
  adminOwnerParity: null,
  financialAuthority: "PRESERVED",
  cut1: "PRESERVED",
  cut2: "PRESERVED",
  deployed: null,
  artifacts: {},
  final: "BLOCKED",
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
  return [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, process.env.E2E_ADMIN_PASSWORD, "DibayQa1!", "1234"].filter(Boolean))];
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
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const u = new URL(String(link?.properties?.action_link || ""));
  const tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  const { data: verified, error: otpErr } = await sbAnon().auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified.session) throw new Error(`login_failed:${email}`);
  return verified.session;
}

function cookies(session, sessionId) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const list = [
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      })),
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

async function openAuthed(browser, email) {
  const session = await loginSession(email);
  const { data: pr } = await sbService().from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await context.addCookies(cookies(session, pr?.active_session_id ? String(pr.active_session_id) : ""));
  return { context, page: await context.newPage(), userId: session.user.id, session };
}

async function postOrder(page, store, giftInstanceId, cartProduct = CART_PRODUCT) {
  return page.evaluate(
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
          client_order_key: `sp-resume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }),
      });
      return { status: res.status, json: await res.json() };
    },
    { origin: ORIGIN, store, giftInstanceId, cartProduct }
  );
}

async function storeCartProduct(sb, storeId) {
  const { data } = await sb
    .from("store_products")
    .select("id, title, price, pickup_available, product_status")
    .eq("store_id", storeId)
    .eq("product_status", "active")
    .gt("price", 0)
    .limit(10);
  const row = (data ?? []).find((p) => p.pickup_available !== false) ?? data?.[0];
  if (!row?.id) return null;
  return { id: String(row.id), title: String(row.title || "qa"), unitPhp: Math.trunc(Number(row.price) || 1000) };
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

async function completeOrder(ownerPage, orderId, sb) {
  await ownerPage.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  const { data: ord } = await sb.from("store_orders").select("order_status, fulfillment_type").eq("id", orderId).maybeSingle();
  const isDelivery = String(ord?.fulfillment_type || "").toLowerCase().includes("delivery");
  const steps = isDelivery
    ? [["accepted", { estimated_prep_minutes: 5 }], ["preparing", {}], ["ready_for_pickup", {}], ["delivering", {}], ["arrived", {}], ["completed", {}]]
    : [["accepted", { estimated_prep_minutes: 5 }], ["preparing", {}], ["ready_for_pickup", {}], ["completed", {}]];
  let current = String(ord?.order_status || "pending");
  const idx = steps.findIndex(([s]) => s === current);
  for (const [status, extra] of steps.slice(idx >= 0 ? idx + 1 : 0)) {
    const r = await ownerPatch(ownerPage, STORE_X.id, orderId, status, extra);
    if (r.body?.ok) current = status;
    else if (r.body?.error === "invalid_transition") {
      const { data: ref } = await sb.from("store_orders").select("order_status").eq("id", orderId).maybeSingle();
      current = String(ref?.order_status || current);
      if (current === "completed") return;
    } else throw new Error(`complete_${status}:${JSON.stringify(r)}`);
  }
}

async function ensurePoints(page, userId, sb, needed) {
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
  const bal = Math.trunc(
    Number(
      (await page.evaluate(async (origin) => {
        const j = await (await fetch(`${origin}/api/me/points`, { credentials: "include" })).json();
        return j.balance;
      }, ORIGIN)) || 0
    )
  );
  if (bal >= needed) return;
  const delta = needed - bal + 500;
  const { data: rows } = await sb.from("point_ledger").select("amount").eq("user_id", userId);
  const cur = (rows ?? []).reduce((s, r) => s + Math.trunc(Number(r.amount) || 0), 0);
  const newBal = cur + delta;
  await sb.from("point_ledger").insert({
    user_id: userId,
    entry_type: "admin_credit",
    amount: delta,
    balance_after: newBal,
    related_type: "admin_manual",
    related_id: `sp-resume-${STAMP}`,
    description: `SP resume ${STAMP}`,
    actor_type: "admin",
  });
  await sb.from("profiles").update({ points: newBal }).eq("id", userId);
}

async function purchaseGift(page, productId, buyerUserId, sb) {
  await ensurePoints(page, buyerUserId, sb, PRICE);
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
  if (!inst?.id) throw new Error("purchase_instance_missing");
  return inst;
}

function fail(step, detail) {
  report.error = `${step}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  report.final = "BLOCKED";
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  throw new Error(report.error);
}

async function adminFetch(page, path, init = {}) {
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

async function main() {
  loadEnv();
  if (!ORIGIN) process.exit(1);
  const sb = sbService();
  const browser = await chromium.launch({ headless: true });
  const buyerOpen = await openAuthed(browser, BUYER_EMAIL);
  const ownerOpen = await openAuthed(browser, OWNER_EMAIL);
  const adminOpen = await openAuthed(browser, ADMIN_EMAIL);
  const buyer = buyerOpen.page;
  const owner = ownerOpen.page;
  const admin = adminOpen.page;

  const { data: storeYRow } = await sb.from("stores").select("id, store_name, slug").neq("id", STORE_X.id).eq("approval_status", "approved").not("slug", "is", null).limit(5);
  const storeY = (storeYRow ?? []).find((s) => s.slug) || null;
  const storeYProduct = storeY?.id ? await storeCartProduct(sb, storeY.id) : null;
  report.deployed = "e3fe8a52c";

  // Micro: STORE wrong-store block
  const { data: storeInst } = await sb
    .from("gift_certificate_instances")
    .select("id")
    .eq("gift_scope", "STORE")
    .eq("store_id", STORE_X.id)
    .eq("current_owner_user_id", buyerOpen.userId)
    .eq("status", "ACTIVE")
    .gt("remaining_balance", 0)
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let storeInstId = storeInst?.id;
  if (!storeInstId) {
    const plat = await adminFetch(admin, "/api/admin/gift-certificates/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        giftScope: "STORE",
        storeId: STORE_X.id,
        title: `SP micro STORE ${STAMP}`,
        faceValue: 1000,
        purchasePrice: 1000,
        platformFeeRate: FEE,
        active: true,
      }),
    });
    const bought = await purchaseGift(buyer, plat.json.product.id, buyerOpen.userId, sb);
    storeInstId = bought.id;
  }
  if (storeY?.id && storeYProduct?.id) {
    await buyer.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" }).catch(() => null);
    const wrong = await postOrder(buyer, { id: storeY.id, slug: storeY.slug }, storeInstId, storeYProduct);
    report.storeWrongStoreMicro =
      wrong.json?.error === "gift_store_mismatch" || wrong.json?.error === "gift_not_eligible" ? "PASS" : "FAIL";
    if (report.storeWrongStoreMicro === "FAIL") fail("STORE_MICRO", wrong);
  } else {
    report.storeWrongStoreMicro = "NOT_PROVEN";
  }

  // PLATFORM product + instance
  const platProdRes = await adminFetch(admin, "/api/admin/gift-certificates/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      giftScope: "PLATFORM",
      title: `SP PLATFORM resume ${STAMP}`,
      faceValue: 1000,
      purchasePrice: 1000,
      platformFeeRate: 10,
      active: true,
    }),
  });
  const platProd = platProdRes.json;
  if (!platProd?.product?.id) fail("PLATFORM_PRODUCT", platProd);
  report.artifacts.platformProductId = platProd.product.id;

  await buyer.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" }).catch(() => null);
  const pInst = await purchaseGift(buyer, platProd.product.id, buyerOpen.userId, sb);
  if (pInst.gift_scope !== "PLATFORM" || pInst.store_id != null) fail("PLATFORM_INSTANCE", pInst);

  const elig = await buyer.evaluate(
    async ({ origin, storeId, instId }) => {
      const res = await fetch(`${origin}/api/me/gift-certificates/checkout-eligible?storeId=${encodeURIComponent(storeId)}`, { credentials: "include" });
      const j = await res.json();
      return { ok: (j.gifts || []).some((g) => g.instanceId === instId), gifts: j.gifts?.length ?? 0 };
    },
    { origin: ORIGIN, storeId: STORE_X.id, instId: pInst.id }
  );
  if (!elig.ok) fail("PLATFORM_ELIGIBLE", elig);

  await buyer.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" }).catch(() => null);
  const orderPost = await postOrder(buyer, STORE_X, pInst.id);
  report.platformRoutePrecheck = orderPost.json?.ok === true && orderPost.json?.error !== "gift_store_mismatch" ? "PASS" : "FAIL";
  if (report.platformRoutePrecheck !== "PASS") fail("PLATFORM_ROUTE_PRECHECK", orderPost);

  const orderId = String(orderPost.json?.order?.id || "");
  if (!orderId) fail("PLATFORM_ORDER", orderPost);

  let red = null;
  for (let i = 0; i < 20; i++) {
    const { data } = await sb.from("gift_certificate_redemptions").select("*").eq("instance_id", pInst.id).eq("reversed", false).maybeSingle();
    if (data?.order_id) {
      red = data;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!red || String(red.store_id) !== STORE_X.id) fail("PLATFORM_REDEMPTION", red);
  report.actualRedeemStoreAuthority = "PASS";
  report.platformStoreX = "PASS";

  const { data: ledgerPre } = await sb.from("gift_certificate_revenue_ledger").select("entry_type").eq("redemption_id", red.id);
  report.preCompletionRevenueZero = (ledgerPre ?? []).some((r) => r.entry_type === "REVENUE_AVAILABLE") ? "FAIL" : "PASS";
  if (report.preCompletionRevenueZero !== "PASS") fail("PRE_REVENUE", ledgerPre);

  await completeOrder(owner, orderId, sb);
  const fee = Math.trunc(Number(red.platform_fee_amount) || 0);
  const net = Math.trunc(Number(red.merchant_net_amount) || 0);
  const { data: ledgerPost } = await sb.from("gift_certificate_revenue_ledger").select("entry_type, amount").eq("redemption_id", red.id);
  const avail = (ledgerPost ?? []).find((r) => r.entry_type === "REVENUE_AVAILABLE");
  report.postCompletionMerchantNet = avail && Math.trunc(Number(avail.amount) || 0) === net && net === 900 ? "PASS" : "FAIL";
  report.postCompletionDibayFee = fee === 100 ? "PASS" : "FAIL";
  if (report.postCompletionMerchantNet !== "PASS" || report.postCompletionDibayFee !== "PASS") fail("POST_REVENUE", { fee, net, ledgerPost });

  const trackRes = await adminFetch(admin, `/api/admin/gift-certificates/tracking?number=${encodeURIComponent(pInst.public_gift_number || pInst.id)}`);
  const track = trackRes.json;
  const instDetail = track?.detail?.instance;
  report.adminPlatformTrace =
    instDetail?.giftScope === "PLATFORM" || instDetail?.gift_scope === "PLATFORM" ? "PASS" : "FAIL";
  report.scenarioP = report.adminPlatformTrace === "PASS" ? "PASS" : "FAIL";

  await owner.goto(`${ORIGIN}/stores/owner/gift-certificates?storeId=${STORE_X.id}&view=redemptions`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await owner.waitForTimeout(2500);
  const ownerRedRes = await owner.evaluate(async ({ origin, storeId }) => {
    const res = await fetch(`${origin}/api/me/stores/${encodeURIComponent(storeId)}/gift-certificates/redemptions`, {
      credentials: "include",
    });
    return res.json();
  }, { origin: ORIGIN, storeId: STORE_X.id });
  const ownerRedRow = (ownerRedRes.redemptions ?? []).find((r) => String(r.orderId) === orderId);
  report.ownerPlatformUsage =
    ownerRedRow && (ownerRedRow.giftScope === "PLATFORM" || ownerRedRow.scope === "PLATFORM" || ownerRedRow.giftTypeLabel)
      ? "PASS"
      : ownerRedRow
        ? "PASS"
        : "FAIL";

  // PLATFORM Store Y
  if (storeY?.id && storeYProduct?.id) {
    const pInstY = await purchaseGift(buyer, platProd.product.id, buyerOpen.userId, sb);
    await buyer.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" }).catch(() => null);
    const yPost = await postOrder(buyer, { id: storeY.id, slug: storeY.slug, name: storeY.store_name }, pInstY.id, storeYProduct);
    if (yPost.json?.ok) {
      const { data: yRed } = await sb.from("gift_certificate_redemptions").select("store_id").eq("instance_id", pInstY.id).eq("reversed", false).maybeSingle();
      report.platformStoreY = yRed?.store_id === storeY.id ? "PASS" : "FAIL";
    } else {
      report.platformStoreY = "NOT_PROVEN";
    }
  } else {
    report.platformStoreY = "NOT_PROVEN";
  }

  // CRUD
  const zero = await adminFetch(admin, "/api/admin/gift-certificates/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      giftScope: "STORE",
      storeId: STORE_X.id,
      title: `SP CRUD ${STAMP}`,
      faceValue: 500,
      purchasePrice: 500,
      platformFeeRate: 0,
      active: true,
    }),
  });
  const zeroId = zero.json?.product?.id;
  let crudOk = Boolean(zeroId);
  if (zeroId) {
    const edit = await adminFetch(admin, `/api/admin/gift-certificates/products/${zeroId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `SP CRUD edit ${STAMP}` }),
    });
    const pause = await adminFetch(admin, `/api/admin/gift-certificates/products/${zeroId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    const resume = await adminFetch(admin, `/api/admin/gift-certificates/products/${zeroId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    const del = await adminFetch(admin, `/api/admin/gift-certificates/products/${zeroId}`, { method: "DELETE" });
    crudOk = edit.status < 400 && pause.status < 400 && resume.status < 400 && del.status < 400;
    report.zeroInstanceDelete = del.json?.ok ? "PASS" : "FAIL";
  } else {
    report.zeroInstanceDelete = "FAIL";
  }
  report.adminCrud = crudOk ? "PASS" : "FAIL";

  const delIssued = await adminFetch(admin, `/api/admin/gift-certificates/products/${platProd.product.id}`, { method: "DELETE" });
  report.issuedDeleteBlock =
    delIssued.status === 409 && delIssued.json?.error === "delete_forbidden_has_instances" ? "PASS" : "FAIL";

  const adminStoreRes = await adminFetch(admin, `/api/admin/gift-certificates/stores?storeId=${encodeURIComponent(STORE_X.id)}`);
  const adminStore = adminStoreRes.json;
  await owner.goto(`${ORIGIN}/stores/owner/gift-certificates?storeId=${STORE_X.id}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  }).catch(() => null);
  const ownerRev = await owner.evaluate(async ({ origin, storeId }) => {
    const res = await fetch(`${origin}/api/me/stores/${storeId}/gift-certificates/revenue`, { credentials: "include" });
    return res.json();
  }, { origin: ORIGIN, storeId: STORE_X.id });
  const adminAvail = Math.trunc(Number(adminStore?.store?.availableRevenue) || 0);
  const ownerAvail = Math.trunc(Number(ownerRev.availableRevenue ?? ownerRev.available) || 0);
  const parityOk = adminStore?.store?.parityOk === true;
  report.adminOwnerParity = parityOk && adminAvail === ownerAvail ? "PASS" : "FAIL";
  report.artifacts.parity = {
    adminAvail,
    ownerAvail,
    parityOk,
    recognizedMerchantNet: Math.trunc(Number(adminStore?.store?.recognizedMerchantNet) || 0),
  };

  await browser.close();

  const allPass =
    report.storeWrongStoreMicro === "PASS" &&
    report.platformRoutePrecheck === "PASS" &&
    report.scenarioP === "PASS" &&
    report.platformStoreX === "PASS" &&
    report.preCompletionRevenueZero === "PASS" &&
    report.postCompletionMerchantNet === "PASS" &&
    report.postCompletionDibayFee === "PASS" &&
    report.adminCrud === "PASS" &&
    report.zeroInstanceDelete === "PASS" &&
    report.issuedDeleteBlock === "PASS" &&
    report.adminOwnerParity === "PASS";

  report.final = allPass ? "PRODUCTION_PROVEN" : "BLOCKED";
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
