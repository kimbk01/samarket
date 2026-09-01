#!/usr/bin/env node
/**
 * Bounded three-currency Production E2E.
 *
 * This script intentionally writes financial QA records. It only runs against the
 * fixed QA actors/store and requires:
 *
 *   CURRENCY_PROD_E2E_CONFIRM=I_UNDERSTAND_BOUNDED_PRODUCTION_WRITES \
 *   PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 *   node --env-file=.env.local scripts/qa/three-currency-production-e2e.mjs
 *
 * It never deletes or rewrites financial ledger rows. If the QA Cash balance is
 * already above ₱20, it stops instead of normalizing the account downward.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(
  process.cwd(),
  process.env.CURRENCY_PROD_E2E_REPORT ||
    "scripts/qa/reports/three-currency-production-e2e-report.json"
);
const CONFIRM = "I_UNDERSTAND_BOUNDED_PRODUCTION_WRITES";
const RUN_ID = `currency-prod-e2e-${Date.now()}`;
const MAX_POINT_CREDIT = 10_000;
const SKIP_POINT_ADMIN = process.env.CURRENCY_PROD_E2E_SKIP_POINT_ADMIN === "1";
const EXISTING_GIFT_INSTANCE_ID = String(
  process.env.CURRENCY_QA_EXISTING_GIFT_INSTANCE_ID || ""
).trim();
const MAX_AD_SPEND_MINOR = Math.max(
  1,
  Math.trunc(Number(process.env.CURRENCY_PROD_E2E_MAX_AD_SPEND_MINOR || 50_000))
);

const QA = Object.freeze({
  store: {
    id: process.env.CURRENCY_QA_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec",
    slug: process.env.CURRENCY_QA_STORE_SLUG || "aa11",
  },
  buyer: { email: process.env.CURRENCY_QA_BUYER_EMAIL || "wwww@manual.local" },
  owner: {
    email: process.env.CURRENCY_QA_OWNER_EMAIL || "sadads@adsasdsa.com",
    expectedUserId:
      process.env.CURRENCY_QA_OWNER_ID || "f00de57c-27d1-495c-824e-e39eab3227aa",
  },
  admin: { email: process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local" },
  orderProduct: {
    id: process.env.CURRENCY_QA_ORDER_PRODUCT_ID || "5c3800d3-675b-4edd-a7dc-ac91252a473b",
    unitPhp: 150,
    qty: 6,
  },
  giftOrderProduct: {
    id: process.env.CURRENCY_QA_GIFT_ORDER_PRODUCT_ID || "7929c806-4f49-4e91-98d8-43304e026134",
    unitPhp: 2_000,
    qty: 1,
  },
  adPackageId:
    process.env.CURRENCY_QA_AD_PACKAGE_ID || "88068455-0af6-4e5a-a12c-0e368c3a3d43",
});

const report = {
  title: "DIBAY THREE-CURRENCY PRODUCTION E2E",
  runId: RUN_ID,
  origin: ORIGIN,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  boundedQa: {
    storeId: QA.store.id,
    buyerEmail: QA.buyer.email,
    ownerEmail: QA.owner.email,
    adminEmail: QA.admin.email,
    maxPointCredit: MAX_POINT_CREDIT,
    maxAdSpendMinor: MAX_AD_SPEND_MINOR,
  },
  steps: {},
  artifacts: {
    pointChargeRequestId: null,
    giftInstanceId: null,
    saleOrderId: null,
    giftOrderId: null,
    adCampaignId: null,
  },
  firstDivergence: null,
  verdict: "NOT_RUN",
};

function writeReport() {
  mkdirSync(dirname(OUT), { recursive: true });
  report.finishedAt = new Date().toISOString();
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
}

class FirstDivergence extends Error {
  constructor(step, detail) {
    super(`FIRST_DIVERGENCE:${step}`);
    this.step = step;
    this.detail = detail;
  }
}

function fail(step, detail) {
  if (!report.firstDivergence) {
    report.firstDivergence = {
      step,
      detail: typeof detail === "string" ? detail : detail ?? null,
      at: new Date().toISOString(),
    };
  }
  report.steps[step] = { status: "FAIL", detail: detail ?? null };
  report.verdict = "FIRST_DIVERGENCE";
  writeReport();
  throw new FirstDivergence(step, detail);
}

function pass(step, evidence) {
  report.steps[step] = { status: "PASS", evidence: evidence ?? null };
  writeReport();
}

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const text = line.trim();
      if (!text || text.startsWith("#")) continue;
      const eq = text.indexOf("=");
      if (eq < 1) continue;
      const key = text.slice(0, eq).trim();
      let value = text.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) fail("PREFLIGHT_ENV", `missing_${name}`);
  return value;
}

function serviceClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function anonClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
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

async function login(email) {
  const sb = anonClient();
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) return data.session;
  }
  fail("AUTH", `login_failed:${email}`);
}

async function cookieHeader(sb, session) {
  const ref = new URL(requireEnv("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  );
  const chunks = [];
  for (let i = 0; i < encoded.length; i += 3180) chunks.push(encoded.slice(i, i + 3180));
  const auth =
    chunks.length === 1
      ? [`sb-${ref}-auth-token=${chunks[0]}`]
      : chunks.map((value, index) => `sb-${ref}-auth-token.${index}=${value}`);
  const { data: profile, error } = await sb
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) fail("AUTH_COOKIE", error.message);
  if (profile?.active_session_id) {
    auth.push(`samarket_active_session_id=${encodeURIComponent(String(profile.active_session_id))}`);
  }
  return auth.join("; ");
}

async function request(cookie, method, path, body) {
  const response = await fetch(`${ORIGIN}${path}`, {
    method,
    redirect: "manual",
    headers: {
      cookie,
      accept: "application/json, text/html",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // HTML probes intentionally have no JSON body.
  }
  return {
    ok: response.ok,
    status: response.status,
    location: response.headers.get("location"),
    text,
    json,
  };
}

async function row(sb, table, select, column, value) {
  const result = await sb.from(table).select(select).eq(column, value).maybeSingle();
  if (result.error) fail(`DB_${table.toUpperCase()}`, result.error.message);
  return result.data;
}

async function exactCount(query, step) {
  const result = await query;
  if (result.error) fail(step, result.error.message);
  return result.count ?? 0;
}

async function coinBalance(sb) {
  const account = await row(sb, "store_economic_point_accounts", "balance", "store_id", QA.store.id);
  return Math.trunc(Number(account?.balance) || 0);
}

async function cashBalanceMinor(sb) {
  const account = await row(sb, "business_cash_accounts", "balance_minor", "store_id", QA.store.id);
  return Math.trunc(Number(account?.balance_minor) || 0);
}

async function ensureAddress(sb, buyerId) {
  const store = await row(sb, "stores", "lat,lng", "id", QA.store.id);
  const { data, error } = await sb
    .from("user_addresses")
    .select("id,phone_number,latitude,longitude")
    .eq("user_id", buyerId)
    .eq("is_active", true);
  if (error) fail("BUYER_ADDRESS", error.message);
  const distance = (address) => {
    const lat = Number(address.latitude) - Number(store?.lat);
    const lng = Number(address.longitude) - Number(store?.lng);
    return lat * lat + lng * lng;
  };
  const address = (data || [])
    .filter((item) => item.latitude != null && item.longitude != null)
    .sort((a, b) => distance(a) - distance(b))[0];
  if (!address?.id) fail("BUYER_ADDRESS", "no_active_geo_address");
  return { id: address.id, phone: address.phone_number || "+639121121211" };
}

async function placeOrder(cookie, address, { product, giftInstanceId = null, suffix }) {
  return request(cookie, "POST", "/api/me/store-orders", {
    store_id: QA.store.id,
    fulfillment_type: "local_delivery",
    payment_method: "cod",
    buyer_phone: address.phone,
    delivery_user_address_id: address.id,
    buyer_note: `${RUN_ID}:${suffix}`,
    client_order_key: `${RUN_ID}:${suffix}`,
    items: [
      {
        product_id: product.id,
        qty: product.qty,
        client_unit_php: product.unitPhp,
      },
    ],
    ...(giftInstanceId ? { gift_instance_ids: [giftInstanceId] } : {}),
  });
}

async function placeSale900WithTemporaryMinimum(sb, buyerCookie, address) {
  const store = await row(sb, "stores", "business_hours_json", "id", QA.store.id);
  const original =
    store?.business_hours_json &&
    typeof store.business_hours_json === "object" &&
    !Array.isArray(store.business_hours_json)
      ? store.business_hours_json
      : {};
  const originalMinimum = Number(original.min_order_php ?? original.minOrderPhp);
  const needsOverride = Number.isFinite(originalMinimum) && originalMinimum > 900;

  if (needsOverride) {
    const { error } = await sb
      .from("stores")
      .update({ business_hours_json: { ...original, min_order_php: 900 } })
      .eq("id", QA.store.id);
    if (error) fail("SALE_900_MIN_ORDER_FIXTURE", error.message);
  }

  try {
    return await placeOrder(buyerCookie, address, {
      product: QA.orderProduct,
      suffix: "sale900",
    });
  } finally {
    if (needsOverride) {
      const { error } = await sb
        .from("stores")
        .update({ business_hours_json: original })
        .eq("id", QA.store.id);
      if (error) fail("SALE_900_MIN_ORDER_RESTORE", error.message);
      pass("SALE_900_MIN_ORDER_FIXTURE", {
        temporaryMinimumPhp: 900,
        restoredMinimumPhp: originalMinimum,
      });
    }
  }
}

async function completeOrder(ownerCookie, orderId) {
  for (const [status, extra] of [
    ["accepted", { estimated_prep_minutes: 15 }],
    ["preparing", {}],
    ["ready_for_pickup", {}],
    ["delivering", {}],
    ["completed", {}],
  ]) {
    const result = await request(
      ownerCookie,
      "PATCH",
      `/api/me/stores/${QA.store.id}/orders/${orderId}`,
      { order_status: status, ...extra }
    );
    if (!result.ok) fail(`ORDER_STATUS_${status.toUpperCase()}`, result);
  }
}

async function confirmedRevenue(sb, orderId) {
  const order = await row(
    sb,
    "store_orders",
    "payment_amount,gift_redemption_amount,platform_funded_amount,order_status",
    "id",
    orderId
  );
  const revenue = Math.max(
    0,
    Math.trunc(Number(order?.payment_amount) || 0) +
      Math.trunc(Number(order?.gift_redemption_amount) || 0) +
      Math.trunc(Number(order?.platform_funded_amount) || 0)
  );
  return { order, revenue };
}

async function ensureCashExactlyTwenty(sb, ownerCookie, adminCookie) {
  const before = await cashBalanceMinor(sb);
  if (before > 2_000) {
    fail("CASH_20_PRECONDITION", {
      balanceMinor: before,
      reason: "bounded_harness_will_not_debit_or_overwrite_existing_cash_to_normalize",
    });
  }
  if (before < 2_000) {
    const topUp = await request(ownerCookie, "POST", `/api/me/stores/${QA.store.id}/business-cash`, {
      op: "topup_request",
      amountMinor: 2_000 - before,
      idempotencyKey: `${RUN_ID}:cash20`,
    });
    if (!topUp.ok || !topUp.json?.requestId) fail("CASH_20_TOPUP_REQUEST", topUp);
    const approve = await request(adminCookie, "POST", "/api/admin/business-cash-charges", {
      op: "approve",
      requestId: topUp.json.requestId,
    });
    if (!approve.ok || approve.json?.ok !== true) fail("CASH_20_TOPUP_APPROVE", approve);
  }
  const after = await cashBalanceMinor(sb);
  if (after !== 2_000) fail("CASH_20_PRECONDITION", { expectedMinor: 2_000, actualMinor: after });
  pass("CASH_20_PRECONDITION", { beforeMinor: before, afterMinor: after });
}

async function pointAndGiftPurchase(sb, buyerCookie, adminCookie, buyerId) {
  const { data: plans, error: planError } = await sb
    .from("point_plans")
    .select("id,point_amount,bonus_amount,is_active")
    .eq("is_active", true)
    .order("point_amount", { ascending: true })
    .limit(20);
  if (planError) fail("POINT_PLAN", planError.message);

  const { data: products, error: giftError } = await sb
    .from("gift_certificate_products")
    .select("id,purchase_price,face_value,store_id,gift_scope,active")
    .eq("active", true)
    .or(`store_id.eq.${QA.store.id},gift_scope.eq.PLATFORM`)
    .gt("purchase_price", 0)
    .order("purchase_price", { ascending: true })
    .limit(20);
  if (giftError) fail("GIFT_PRODUCT", giftError.message);

  let fixture = null;
  for (const plan of plans || []) {
    const credit =
      Math.trunc(Number(plan.point_amount) || 0) + Math.trunc(Number(plan.bonus_amount) || 0);
    const product = (products || []).find(
      (candidate) => Math.trunc(Number(candidate.purchase_price) || 0) <= credit
    );
    if (product && credit <= MAX_POINT_CREDIT) {
      fixture = { plan, product, credit };
      break;
    }
  }
  if (!fixture) {
    fail("POINT_GIFT_FIXTURE", {
      reason: "no_active_bounded_plan_and_store_gift_product_pair",
      maxPointCredit: MAX_POINT_CREDIT,
    });
  }

  const beforeRes = await request(buyerCookie, "GET", "/api/me/points?filter=all&limit=100");
  if (!beforeRes.ok || beforeRes.json?.ok !== true) fail("POINT_HISTORY_BEFORE", beforeRes);
  const before = Math.trunc(Number(beforeRes.json.balance) || 0);

  const charge = await request(buyerCookie, "POST", "/api/me/points/charge", {
    planId: fixture.plan.id,
    paymentMethod: "manual_confirm",
    depositorName: "DIBAY Currency QA",
    userMemo: RUN_ID,
  });
  const requestId = String(charge.json?.request?.id || "");
  if (!charge.ok || !requestId) fail("POINT_CHARGE", charge);
  report.artifacts.pointChargeRequestId = requestId;

  const approve = await request(
    adminCookie,
    "PATCH",
    `/api/admin/point-charges/${requestId}`,
    { action: "approve", adminMemo: RUN_ID }
  );
  if (!approve.ok || approve.json?.ok !== true) fail("POINT_APPROVE", approve);
  const approvedAmount = Math.trunc(Number(approve.json.point_amount) || 0);
  if (approvedAmount !== fixture.credit) {
    fail("POINT_APPROVE_AMOUNT", { expected: fixture.credit, actual: approvedAmount });
  }

  const purchaseKey = `${RUN_ID}:gift-purchase`;
  const purchase = await request(buyerCookie, "POST", "/api/me/gift-certificates/purchase", {
    productId: fixture.product.id,
    idempotencyKey: purchaseKey,
  });
  const instanceId = String(purchase.json?.instance_id || "");
  if (!purchase.ok || purchase.json?.ok !== true || !instanceId) fail("POINT_SPEND_GIFT", purchase);
  report.artifacts.giftInstanceId = instanceId;

  const afterRes = await request(buyerCookie, "GET", "/api/me/points?filter=all&limit=100");
  if (!afterRes.ok || afterRes.json?.ok !== true) fail("POINT_HISTORY_AFTER", afterRes);
  const after = Math.trunc(Number(afterRes.json.balance) || 0);
  const price = Math.trunc(Number(fixture.product.purchase_price) || 0);
  const items = afterRes.json?.history?.items || [];
  const creditItem = items.find(
    (item) => String(item.relatedId || item.related_id || "") === requestId && Number(item.signedAmount) > 0
  );
  const spendItem = items.find(
    (item) =>
      String(item.relatedId || item.related_id || "").startsWith(purchaseKey) &&
      Math.trunc(Number(item.signedAmount) || 0) === -price
  );
  if (after !== before + approvedAmount - price || !creditItem || !spendItem) {
    fail("POINT_HISTORY_RECONCILIATION", {
      before,
      approvedAmount,
      price,
      after,
      creditHistoryFound: Boolean(creditItem),
      spendHistoryFound: Boolean(spendItem),
    });
  }
  pass("POINT_CHARGE_APPROVE_SPEND_HISTORY", {
    before,
    approvedAmount,
    spent: price,
    after,
    requestId,
    purchaseKey,
    instanceId,
    buyerId,
  });
  return { instanceId, product: fixture.product };
}

async function saleCashCoinScenario(sb, buyerCookie, ownerCookie, adminCookie, address) {
  await ensureCashExactlyTwenty(sb, ownerCookie, adminCookie);
  const coinBefore = await coinBalance(sb);
  const placed = await placeSale900WithTemporaryMinimum(sb, buyerCookie, address);
  const orderId = String(placed.json?.order?.id || "");
  if (!placed.ok || !orderId) fail("SALE_900_PLACE", placed);
  report.artifacts.saleOrderId = orderId;

  await completeOrder(ownerCookie, orderId);
  const { order, revenue } = await confirmedRevenue(sb, orderId);
  if (order?.order_status !== "completed" || revenue !== 900) {
    fail("SALE_900_CONFIRMED_REVENUE", { order, expected: 900, actual: revenue });
  }

  const saleCoin = await row(
    sb,
    "store_economic_point_ledger",
    "id,entry_kind,amount,balance_after,idempotency_key",
    "idempotency_key",
    `sale_coin:${orderId}`
  );
  const coinAfter = await coinBalance(sb);
  const saleCoinCount = await exactCount(
    sb
      .from("store_economic_point_ledger")
      .select("id", { count: "exact", head: true })
      .eq("store_id", QA.store.id)
      .eq("idempotency_key", `sale_coin:${orderId}`),
    "SALE_900_COIN_COUNT"
  );
  if (
    saleCoinCount !== 1 ||
    saleCoin?.entry_kind !== "SALE_EARN" ||
    Math.trunc(Number(saleCoin.amount) || 0) !== 900 ||
    coinAfter - coinBefore !== 900
  ) {
    fail("SALE_900_COIN_ONCE", { saleCoinCount, saleCoin, coinBefore, coinAfter });
  }

  const legacyAcceptDebits = await exactCount(
    sb
      .from("store_point_ledger")
      .select("id", { count: "exact", head: true })
      .eq("store_id", QA.store.id)
      .eq("order_id", orderId)
      .eq("entry_type", "store_order_fee"),
    "SALE_900_LEGACY_LEDGER"
  );
  if (legacyAcceptDebits !== 0) {
    fail("NO_STORE_POINT_ACCEPT_DEBIT", { orderId, count: legacyAcceptDebits });
  }

  const fee = await row(
    sb,
    "business_cash_ledger",
    "id,entry_kind,direction,amount_minor,balance_after_minor,idempotency_key",
    "idempotency_key",
    `sale_fee:order:${orderId}`
  );
  const obligation = await row(sb, "store_sale_fee_obligations", "*", "order_id", orderId);
  const cashAfter = await cashBalanceMinor(sb);
  if (
    fee?.entry_kind !== "SALE_FEE" ||
    fee?.direction !== "debit" ||
    Math.abs(Math.trunc(Number(fee.amount_minor) || 0)) !== 2_000 ||
    cashAfter !== 0 ||
    Math.trunc(Number(obligation?.fee_due_minor) || 0) !== 4_500 ||
    Math.trunc(Number(obligation?.fee_paid_minor) || 0) !== 2_000 ||
    Math.trunc(Number(obligation?.fee_outstanding_minor) || 0) !== 2_500
  ) {
    fail("CASH_20_FEE_45_OUTSTANDING_25", { fee, obligation, cashAfter });
  }
  pass("SALE_900_COIN_AND_CASH_FEE", {
    orderId,
    confirmedRevenue: revenue,
    coinCredit: 900,
    legacyAcceptDebits,
    cashPaidMinor: 2_000,
    feeDueMinor: 4_500,
    outstandingMinor: 2_500,
  });

  const policy = await row(
    sb,
    "business_cash_conversion_rate_policies",
    "version,rate_pesos_per_point",
    "id",
    "default"
  );
  const rateVersion = Math.trunc(Number(policy?.version) || 0);
  if (Number(policy?.rate_pesos_per_point) !== 1 || rateVersion < 1) {
    fail("COIN_TO_CASH_RATE", policy);
  }
  const convertKey = `${RUN_ID}:coin-to-cash`;
  const coinBeforeConvert = await coinBalance(sb);
  const cashBeforeConvert = await cashBalanceMinor(sb);
  const { data: converted, error: convertError } = await sb.rpc(
    "convert_store_economic_points_to_business_cash",
    {
      p_owner_user_id: QA.owner.expectedUserId,
      p_store_id: QA.store.id,
      p_points: 100,
      p_expected_rate_version: rateVersion,
      p_idempotency_key: convertKey,
    }
  );
  if (convertError || converted?.ok !== true || converted?.idempotent === true) {
    fail("COIN_TO_CASH_MANUAL", { error: convertError?.message, converted });
  }
  const coinAfterConvert = await coinBalance(sb);
  const cashAfterConvert = await cashBalanceMinor(sb);
  const settled = await row(sb, "store_sale_fee_obligations", "*", "order_id", orderId);
  if (
    coinBeforeConvert - coinAfterConvert !== 100 ||
    cashAfterConvert - cashBeforeConvert !== 7_500 ||
    settled?.status !== "settled" ||
    Math.trunc(Number(settled.fee_outstanding_minor) || 0) !== 0
  ) {
    fail("COIN_TO_CASH_SETTLES_FIRST", {
      coinBeforeConvert,
      coinAfterConvert,
      cashBeforeConvert,
      cashAfterConvert,
      settled,
      converted,
    });
  }
  pass("COIN_TO_CASH_SETTLES_FIRST", {
    convertedCoin: 100,
    outstandingSettledMinor: 2_500,
    usableCashCreditMinor: 7_500,
    conversion: converted,
  });

  const refundRequest = await request(
    buyerCookie,
    "PATCH",
    `/api/me/store-orders/${orderId}`,
    { request_refund: true, refund_reason: RUN_ID }
  );
  if (!refundRequest.ok) fail("REFUND_REQUEST", refundRequest);
  const refundComplete = await request(
    adminCookie,
    "PATCH",
    `/api/admin/store-orders/${orderId}`,
    { complete_refund: true }
  );
  if (!refundComplete.ok) fail("REFUND_COMPLETE", refundComplete);

  const coinReversalKey = `coin_reversal:order:${orderId}`;
  const feeReversalKey = `sale_fee_reversal:order:${orderId}`;
  const [
    { data: coinRetry, error: coinRetryError },
    { data: feeRetry, error: feeRetryError },
  ] = await Promise.all([
    sb.rpc("reverse_coin_credits_for_order", {
      p_order_id: orderId,
      p_idempotency_key: coinReversalKey,
      p_reason: "order_refund",
    }),
    sb.rpc("reverse_sale_fee_for_order", {
      p_order_id: orderId,
      p_idempotency_key: feeReversalKey,
    }),
  ]);
  const coinReversal = await row(
    sb,
    "store_economic_point_ledger",
    "id,entry_kind,amount,idempotency_key",
    "idempotency_key",
    coinReversalKey
  );
  const feeReversal = await row(
    sb,
    "business_cash_ledger",
    "id,entry_kind,direction,amount_minor,idempotency_key",
    "idempotency_key",
    feeReversalKey
  );
  const [coinReversalCount, feeReversalCount] = await Promise.all([
    exactCount(
      sb
        .from("store_economic_point_ledger")
        .select("id", { count: "exact", head: true })
        .eq("idempotency_key", coinReversalKey),
      "REFUND_COIN_REVERSAL_COUNT"
    ),
    exactCount(
      sb
        .from("business_cash_ledger")
        .select("id", { count: "exact", head: true })
        .eq("idempotency_key", feeReversalKey),
      "REFUND_FEE_REVERSAL_COUNT"
    ),
  ]);
  if (
    coinRetryError ||
    feeRetryError ||
    coinRetry?.idempotent !== true ||
    feeRetry?.idempotent !== true ||
    coinReversalCount !== 1 ||
    feeReversalCount !== 1 ||
    coinReversal?.entry_kind !== "REVERSAL" ||
    Math.trunc(Number(coinReversal.amount) || 0) !== -900 ||
    feeReversal?.entry_kind !== "SALE_FEE_REVERSAL"
  ) {
    fail("REFUND_REVERSALS_IDEMPOTENT", {
      coinRetryError: coinRetryError?.message,
      feeRetryError: feeRetryError?.message,
      coinRetry,
      feeRetry,
      coinReversal,
      feeReversal,
      coinReversalCount,
      feeReversalCount,
    });
  }
  pass("REFUND_REVERSALS_IDEMPOTENT", {
    orderId,
    coinReversal,
    feeReversal,
    duplicateRetry: { coin: coinRetry, fee: feeRetry },
  });
}

async function giftCompletedOrderScenario(sb, buyerCookie, ownerCookie, address, instanceId) {
  const coinBefore = await coinBalance(sb);
  const storeCashBefore = await row(sb, "store_cash_accounts", "balance", "store_id", QA.store.id);
  const storeCashLedgerBefore = await exactCount(
    sb
      .from("store_cash_ledger")
      .select("id", { count: "exact", head: true })
      .eq("store_id", QA.store.id),
    "GIFT_STORE_CASH_COUNT_BEFORE"
  );

  const placed = await placeOrder(buyerCookie, address, {
    product: QA.giftOrderProduct,
    giftInstanceId: instanceId,
    suffix: "gift-order",
  });
  const orderId = String(placed.json?.order?.id || "");
  if (!placed.ok || !orderId) fail("GIFT_ORDER_PLACE", placed);
  report.artifacts.giftOrderId = orderId;
  await completeOrder(ownerCookie, orderId);

  const redemption = await row(
    sb,
    "gift_certificate_redemptions",
    "id,instance_id,redeemed_amount,merchant_net_amount,reversed",
    "order_id",
    orderId
  );
  const { order, revenue } = await confirmedRevenue(sb, orderId);
  const coinLedger = await row(
    sb,
    "store_economic_point_ledger",
    "id,entry_kind,amount,idempotency_key",
    "idempotency_key",
    `sale_coin:${orderId}`
  );
  const coinAfter = await coinBalance(sb);
  const storeCashAfter = await row(sb, "store_cash_accounts", "balance", "store_id", QA.store.id);
  const storeCashLedgerAfter = await exactCount(
    sb
      .from("store_cash_ledger")
      .select("id", { count: "exact", head: true })
      .eq("store_id", QA.store.id),
    "GIFT_STORE_CASH_COUNT_AFTER"
  );

  if (
    order?.order_status !== "completed" ||
    !redemption ||
    redemption.instance_id !== instanceId ||
    redemption.reversed === true ||
    revenue <= 0 ||
    coinLedger?.entry_kind !== "SALE_EARN" ||
    Math.trunc(Number(coinLedger.amount) || 0) !== revenue ||
    coinAfter - coinBefore !== revenue ||
    storeCashLedgerAfter !== storeCashLedgerBefore ||
    Math.trunc(Number(storeCashAfter?.balance) || 0) !==
      Math.trunc(Number(storeCashBefore?.balance) || 0)
  ) {
    fail("GIFT_COMPLETED_ORDER_COIN_NO_STORE_CASH", {
      order,
      revenue,
      redemption,
      coinLedger,
      coinBefore,
      coinAfter,
      storeCashBefore,
      storeCashAfter,
      storeCashLedgerBefore,
      storeCashLedgerAfter,
    });
  }
  pass("GIFT_COMPLETED_ORDER_COIN_NO_STORE_CASH", {
    orderId,
    redemptionId: redemption.id,
    confirmedRevenue: revenue,
    coinDelta: coinAfter - coinBefore,
    storeCashWrites: 0,
  });
}

async function adsCanonicalCashScenario(
  sb,
  ownerCookie,
  adminCookie,
  { reserveCashMinor = 0 } = {}
) {
  const commercial = await request(
    ownerCookie,
    "GET",
    `/api/me/delivery-ads/commercial?storeId=${QA.store.id}` +
      `&productKind=store_sponsored&inventoryKey=STORES_HOME_FEED` +
      `&packageId=${QA.adPackageId}`
  );
  const payable = Math.trunc(
    Number(
      commercial.json?.quote?.finalPayableMinor ??
        commercial.json?.selected?.finalPayableMinor ??
        commercial.json?.packages?.find?.((item) => item.id === QA.adPackageId)?.finalPayableMinor
    ) || 0
  );
  if (!commercial.ok || payable <= 0 || payable > MAX_AD_SPEND_MINOR) {
    fail("ADS_BOUNDED_QUOTE", { commercial, payable, max: MAX_AD_SPEND_MINOR });
  }

  const cash = await cashBalanceMinor(sb);
  const requiredCash = payable + Math.max(0, Math.trunc(reserveCashMinor));
  if (cash < requiredCash) {
    const topUp = await request(ownerCookie, "POST", `/api/me/stores/${QA.store.id}/business-cash`, {
      op: "topup_request",
      amountMinor: requiredCash - cash,
      idempotencyKey: `${RUN_ID}:ads-topup`,
    });
    if (!topUp.ok || !topUp.json?.requestId) fail("ADS_CASH_TOPUP_REQUEST", topUp);
    const approve = await request(adminCookie, "POST", "/api/admin/business-cash-charges", {
      op: "approve",
      requestId: topUp.json.requestId,
    });
    if (!approve.ok || approve.json?.ok !== true) fail("ADS_CASH_TOPUP_APPROVE", approve);
  }

  const now = Date.now();
  const draft = await request(ownerCookie, "POST", `/api/me/stores/${QA.store.id}/delivery-ads`, {
    inventoryKeys: ["STORES_HOME_FEED"],
    startAt: new Date(now + 60_000).toISOString(),
    endAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    packageId: QA.adPackageId,
    title: `[QA] ${RUN_ID}`,
    headline: "Three-currency canonical Cash proof",
    clientRequestId: `${RUN_ID}:ad-draft`,
  });
  const campaignId = String(draft.json?.campaign?.id || "");
  if (!draft.ok || !campaignId) fail("ADS_DRAFT", draft);
  report.artifacts.adCampaignId = campaignId;

  const cashBefore = await cashBalanceMinor(sb);
  const submit = await request(
    ownerCookie,
    "POST",
    `/api/me/stores/${QA.store.id}/delivery-ads/${campaignId}/actions`,
    {
      action: "submit",
      productKind: "store_sponsored",
      packageId: QA.adPackageId,
      clientFinalPayableMinor: payable,
    }
  );
  if (!submit.ok || submit.json?.ok !== true) fail("ADS_SUBMIT", submit);
  const cashAfter = await cashBalanceMinor(sb);
  const spend = await row(
    sb,
    "business_cash_ledger",
    "id,store_id,entry_kind,direction,amount_minor,related_type,related_id,idempotency_key",
    "idempotency_key",
    `bc_spend:store_sponsored:${campaignId}`
  );
  const funding = await row(
    sb,
    "delivery_ad_canonical_bc_fundings",
    "id,status,amount_minor,spend_ledger_id,product_kind,application_id",
    "application_id",
    campaignId
  );
  if (
    cashBefore - cashAfter !== payable ||
    spend?.entry_kind !== "AD_SPEND" ||
    spend?.direction !== "debit" ||
    Math.trunc(Number(spend.amount_minor) || 0) !== payable ||
    funding?.status !== "SECURED" ||
    funding?.spend_ledger_id !== spend.id ||
    funding?.product_kind !== "store_sponsored"
  ) {
    fail("ADS_CANONICAL_CASH_DEBIT", { payable, cashBefore, cashAfter, spend, funding });
  }
  pass("ADS_CANONICAL_CASH_DEBIT", {
    campaignId,
    payableMinor: payable,
    reserveCashMinor,
    cashDeltaMinor: cashAfter - cashBefore,
    spendLedgerId: spend.id,
    fundingId: funding.id,
  });
}

function visibleHtmlText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function uiHttpSmoke(ownerCookie, adminCookie) {
  const probes = [
    {
      name: "ownerHome",
      cookie: ownerCookie,
      path: `/stores/owner?storeId=${encodeURIComponent(QA.store.id)}`,
      requiredMarkers: ['data-owner-finance-home-cards="1"', 'data-currency-balance-card="coin"', 'data-currency-balance-card="cash"'],
    },
    {
      name: "ownerFinance",
      cookie: ownerCookie,
      path: `/stores/owner/finance?storeId=${encodeURIComponent(QA.store.id)}`,
      requiredMarkers: ['data-currency-balance-card="coin"', 'data-currency-balance-card="cash"'],
    },
    {
      name: "adminFinance",
      cookie: adminCookie,
      path: "/admin/finance",
      requiredMarkers: ['data-admin-store-finance-panels="1"', 'data-admin-coin-finance-panel="1"', 'data-admin-cash-finance-panel="1"'],
    },
  ];
  const forbidden =
    /\b(?:D-Point|Business Credit|Business Cash|Store Points?|Economic Points?|Store Cash|Gift Store Cash)\b/i;
  const evidence = {};
  for (const probe of probes) {
    const response = await request(probe.cookie, "GET", probe.path);
    const text = visibleHtmlText(response.text);
    const currencyValues = [
      ...response.text.matchAll(/data-currency-balance-card="([^"]+)"/g),
    ].map((match) => match[1]);
    const foreignCurrency = currencyValues.find(
      (value) => !["point", "coin", "cash"].includes(value)
    );
    const missingMarkers = probe.requiredMarkers.filter(
      (marker) => !response.text.includes(marker)
    );
    const forbiddenMatch = text.match(forbidden)?.[0] || null;
    evidence[probe.name] = {
      path: probe.path,
      status: response.status,
      location: response.location,
      currencyValues: [...new Set(currencyValues)],
      missingMarkers,
      forbiddenMatch,
    };
    if (
      !response.ok ||
      response.location ||
      missingMarkers.length ||
      foreignCurrency ||
      forbiddenMatch
    ) {
      fail(`UI_HTTP_${probe.name.toUpperCase()}`, evidence[probe.name]);
    }
  }
  pass("UI_HTTP_THREE_CURRENCIES_ONLY", evidence);
}

async function main() {
  loadEnv();
  writeReport();

  let originUrl;
  try {
    originUrl = new URL(ORIGIN);
  } catch {
    fail("PREFLIGHT_ORIGIN", `invalid_origin:${ORIGIN}`);
  }
  const allowedHost = process.env.CURRENCY_PROD_E2E_HOST || "samarket.vercel.app";
  if (
    process.env.CURRENCY_PROD_E2E_CONFIRM !== CONFIRM ||
    originUrl.protocol !== "https:" ||
    originUrl.hostname !== allowedHost
  ) {
    fail("PREFLIGHT_PRODUCTION_GUARD", {
      requiredConfirm: CONFIRM,
      expectedHost: allowedHost,
      actualOrigin: ORIGIN,
    });
  }

  const sb = serviceClient();
  const [buyerSession, ownerSession, adminSession] = await Promise.all([
    login(QA.buyer.email),
    login(QA.owner.email),
    login(QA.admin.email),
  ]);
  if (
    new Set([buyerSession.user.id, ownerSession.user.id, adminSession.user.id]).size !== 3 ||
    ownerSession.user.id !== QA.owner.expectedUserId
  ) {
    fail("PREFLIGHT_ACTORS", {
      buyerId: buyerSession.user.id,
      ownerId: ownerSession.user.id,
      expectedOwnerId: QA.owner.expectedUserId,
      adminId: adminSession.user.id,
    });
  }
  const store = await row(sb, "stores", "id,owner_user_id,approval_status", "id", QA.store.id);
  if (store?.owner_user_id !== ownerSession.user.id || store?.approval_status !== "approved") {
    fail("PREFLIGHT_STORE", store);
  }

  const [buyerCookie, ownerCookie, adminCookie] = await Promise.all([
    cookieHeader(sb, buyerSession),
    cookieHeader(sb, ownerSession),
    cookieHeader(sb, adminSession),
  ]);
  pass("PREFLIGHT", {
    host: originUrl.hostname,
    storeId: store.id,
    buyerId: buyerSession.user.id,
    ownerId: ownerSession.user.id,
    adminId: adminSession.user.id,
  });

  const address = await ensureAddress(sb, buyerSession.user.id);
  let gift;
  if (SKIP_POINT_ADMIN) {
    if (!EXISTING_GIFT_INSTANCE_ID) {
      fail("GIFT_EXISTING_FIXTURE", "missing_CURRENCY_QA_EXISTING_GIFT_INSTANCE_ID");
    }
    const instance = await row(
      sb,
      "gift_certificate_instances",
      "id,current_owner_user_id,remaining_balance,status",
      "id",
      EXISTING_GIFT_INSTANCE_ID
    );
    if (
      instance?.current_owner_user_id !== buyerSession.user.id ||
      Math.trunc(Number(instance?.remaining_balance) || 0) <= 0 ||
      !["ACTIVE", "PARTIALLY_REDEEMED"].includes(String(instance?.status || ""))
    ) {
      fail("GIFT_EXISTING_FIXTURE", instance);
    }
    report.steps.POINT_ADMIN_AUTH = {
      status: "BLOCKED_BY_CREDENTIAL",
      detail: "authorized Point Admin credential unavailable",
    };
    report.steps.POINT_CHARGE_APPROVE_SPEND_HISTORY = {
      status: "NOT_PROVEN",
      detail: "Point approval smoke requires an authorized Point Admin credential",
    };
    report.artifacts.giftInstanceId = instance.id;
    gift = { instanceId: instance.id };
    writeReport();
  } else {
    gift = await pointAndGiftPurchase(
      sb,
      buyerCookie,
      adminCookie,
      buyerSession.user.id
    );
  }
  await adsCanonicalCashScenario(sb, ownerCookie, adminCookie, {
    reserveCashMinor: 2_000,
  });
  await saleCashCoinScenario(sb, buyerCookie, ownerCookie, adminCookie, address);
  await giftCompletedOrderScenario(sb, buyerCookie, ownerCookie, address, gift.instanceId);
  await uiHttpSmoke(ownerCookie, adminCookie);

  report.verdict = SKIP_POINT_ADMIN ? "PARTIAL" : "PASS";
  report.firstDivergence = null;
  writeReport();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  if (!(error instanceof FirstDivergence)) {
    report.firstDivergence = report.firstDivergence || {
      step: "UNCAUGHT",
      detail: String(error?.stack || error),
      at: new Date().toISOString(),
    };
    report.verdict = "FIRST_DIVERGENCE";
    writeReport();
  }
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 2;
});
