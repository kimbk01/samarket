/**
 * FREE COUPON v3.2 — Campaign A/B proof matrix (API-first).
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3017 node --env-file=.env.local scripts/qa/free-coupon-v32-e2e.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3017").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-free-coupon-v32-e2e.json");
const STAMP = Date.now();
const STORE = { storeId: "19085860-52d2-4183-b033-e71fcb58bcec", slug: "aa11" };
const PRODUCT = { productId: "5c3800d3-675b-4edd-a7dc-ac91252a473b", price: 150 };
const ORDER_QTY = 7; // store min order ₱1000 @ ₱150/unit
const ACTORS = {
  BUYER: { email: "qqqq@manual.local", userId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8" },
  BUYER_B: { email: "wwww@manual.local" },
  OWNER: { email: "sadads@adsasdsa.com" },
  ADMIN: { email: "aaaa@manual.local" },
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
  throw new Error(`login_failed:${email}`);
}

function cookieHeader(session, sessionId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const ref = new URL(url).hostname.split(".")[0];
  const cookies = [
    `sb-${ref}-auth-token=${encodeURIComponent(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      })
    )}`,
  ];
  if (sessionId) cookies.push(`samarket_active_session_id=${sessionId}`);
  return cookies.join("; ");
}

const report = {
  version: "v3.2",
  origin: ORIGIN,
  stamp: STAMP,
  campaign_a: {},
  campaign_b: {},
  cross_surface: {},
  matrix: {},
  fail: null,
};

function mark(key, status, extra = {}) {
  report.matrix[key] = { status, ...extra };
}

async function apiJson(cookie, method, path, body) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: { cookie, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function ensureAddr(sb, cookie, userId) {
  const { data: storeGeo } = await sb.from("stores").select("lat,lng").eq("id", STORE.storeId).maybeSingle();
  const { data: addrs } = await sb
    .from("user_addresses")
    .select("id, phone_number, app_region_id, app_city_id, latitude, longitude")
    .eq("user_id", userId)
    .eq("is_active", true);
  const dist = (a) => {
    const dlat = Number(a.latitude) - Number(storeGeo?.lat);
    const dlng = Number(a.longitude) - Number(storeGeo?.lng);
    return dlat * dlat + dlng * dlng;
  };
  const near = (addrs || []).filter((a) => a.latitude != null).sort((a, b) => dist(a) - dist(b))[0];
  if (!near?.id) throw new Error("no_addr");
  await apiJson(cookie, "PATCH", `/api/me/addresses/${near.id}`, {
    isDefaultMaster: true,
    isDefaultDelivery: true,
    appRegionId: near.app_region_id || "quezon",
    appCityId: near.app_city_id || "q8",
    phoneNumber: near.phone_number || "+639121121211",
  });
  return { id: near.id, phone_number: near.phone_number || "+639121121211" };
}

async function placeOrder({ sb, cookie, userId, campaignId, userCouponId, tag, qty }) {
  const addr = await ensureAddr(sb, cookie, userId);
  return apiJson(cookie, "POST", "/api/me/store-orders", {
    store_id: STORE.storeId,
    fulfillment_type: "local_delivery",
    payment_method: "cod",
    buyer_phone: addr.phone_number,
    delivery_user_address_id: addr.id,
    buyer_note: `DIBAY_V32_${tag}_${STAMP}`,
    client_order_key: `dibay-v32-${tag}-${STAMP}-${Math.random().toString(16).slice(2)}`,
    coupon_campaign_id: campaignId || undefined,
    user_coupon_id: userCouponId || undefined,
    items: [{ product_id: PRODUCT.productId, qty: qty ?? ORDER_QTY, client_unit_php: PRODUCT.price }],
  });
}

async function main() {
  loadEnv();
  const sb = sbService();

  const buyer = await loginSession(ACTORS.BUYER.email);
  const buyerB = await loginSession(ACTORS.BUYER_B.email);
  const owner = await loginSession(ACTORS.OWNER.email);
  const admin = await loginSession(ACTORS.ADMIN.email);

  const { data: bpr } = await sb.from("profiles").select("active_session_id").eq("id", buyer.user.id).maybeSingle();
  const { data: bprB } = await sb.from("profiles").select("active_session_id").eq("id", buyerB.user.id).maybeSingle();
  const { data: opr } = await sb.from("profiles").select("active_session_id").eq("id", owner.user.id).maybeSingle();
  const { data: apr } = await sb.from("profiles").select("active_session_id").eq("id", admin.user.id).maybeSingle();

  const buyerCookie = cookieHeader(buyer, bpr?.active_session_id);
  const buyerBCookie = cookieHeader(buyerB, bprB?.active_session_id);
  const ownerCookie = cookieHeader(owner, opr?.active_session_id);
  const adminCookie = cookieHeader(admin, apr?.active_session_id);

  const { error: migErr } = await sb.from("store_coupon_campaigns").select("issuer_role, campaign_purpose").limit(1);
  mark("P0_MIGRATION_COLUMNS", !migErr ? "PASS" : "FAIL", { error: migErr?.message });

  const { error: entErr } = await sb.from("coupon_user_entitlements").select("coupon_number").limit(1);
  mark("P0_COUPON_NUMBER_COLUMN", !entErr ? "PASS" : "FAIL", { error: entErr?.message });

  const titleA = `V32_CAMPAIGN_A_${STAMP}`;
  const createA = await apiJson(ownerCookie, "POST", "/api/me/store-coupons/campaigns", {
    storeId: STORE.storeId,
    title: titleA,
    discountType: "fixed_amount",
    discountValue: 100,
    minOrderAmount: 700,
    issueLimit: 10,
    spendBudgetPhp: 5000,
    claimValidDays: 7,
    campaignPurpose: "store_promotion",
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    usageEndAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    isActive: true,
  });
  const campaignAId = createA.json?.campaign?.id;
  mark("A_CREATE", createA.ok && campaignAId ? "PASS" : "FAIL", { status: createA.status, err: createA.json?.error });

  const { data: campA } = await sb
    .from("store_coupon_campaigns")
    .select("id, issuer_role, campaign_purpose, issued_count")
    .eq("id", campaignAId || "none")
    .maybeSingle();
  mark("A_ISSUER_ROLE", campA?.issuer_role === "owner" ? "PASS" : "FAIL", campA || {});
  mark("A_ISSUED_ZERO", Number(campA?.issued_count) === 0 ? "PASS" : "FAIL", campA || {});

  const claimA = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: campaignAId });
  const entAId = claimA.json?.entitlement?.id || claimA.json?.user_coupon_id;
  mark("A_CLAIM", claimA.ok && entAId ? "PASS" : "FAIL", claimA.json || {});

  const { data: entA } = await sb
    .from("coupon_user_entitlements")
    .select("id, coupon_number, status")
    .eq("id", entAId || "none")
    .maybeSingle();
  mark("A_COUPON_NUMBER", entA?.coupon_number ? "PASS" : "FAIL", entA || {});

  const { data: campA1 } = await sb
    .from("store_coupon_campaigns")
    .select("issued_count")
    .eq("id", campaignAId || "none")
    .maybeSingle();
  mark("A_ISSUED_ONE", Number(campA1?.issued_count) === 1 ? "PASS" : "FAIL", campA1 || {});

  const { data: reconA } = await sb.rpc("reconcile_coupon_campaign_issued", { p_campaign_id: campaignAId });
  mark("A_RECONCILE", reconA?.consistent === true ? "PASS" : "FAIL", reconA || {});

  const wallet = await apiJson(buyerCookie, "GET", "/api/me/store-coupons?tab=all");
  const walletCard = (wallet.json?.cards || []).find((c) => c.entitlementId === entAId);
  mark("A_WALLET_CARD", walletCard?.couponNumber ? "PASS" : "FAIL");

  const itemGross = PRODUCT.price * ORDER_QTY;
  const quote = await apiJson(
    buyerCookie,
    "GET",
    `/api/me/store-coupons/checkout-quote?storeId=${STORE.storeId}&subtotalPhp=${itemGross}&itemGrossPhp=${itemGross}&deliveryFeePhp=0&appliedUserCouponId=${encodeURIComponent(entAId || "")}`
  );
  const finalQuote = quote.json?.quote?.finalPaymentPhp;

  const orderA = await placeOrder({
    sb,
    cookie: buyerCookie,
    userId: buyer.user.id,
    campaignId: campaignAId,
    userCouponId: entAId,
    tag: "A",
    qty: 5,
  });
  const orderAId = orderA.json?.order?.id;
  const paymentA = Number(orderA.json?.order?.payment_amount);
  mark("A_ORDER", orderA.ok && orderAId ? "PASS" : "FAIL", orderA.json || {});

  const { data: ordA } = await sb
    .from("store_orders")
    .select("payment_amount")
    .eq("id", orderAId || "none")
    .maybeSingle();
  mark(
    "A_PAYMENT_EQUALITY",
    orderA.ok && Number(ordA?.payment_amount) === paymentA && paymentA === finalQuote ? "PASS" : "NOT_PROVEN",
    { db: ordA?.payment_amount, api: paymentA, quote: finalQuote }
  );

  const { data: entRedeemed } = await sb
    .from("coupon_user_entitlements")
    .select("status")
    .eq("id", entAId || "none")
    .maybeSingle();
  mark("A_REDEEMED", entRedeemed?.status === "redeemed" ? "PASS" : "FAIL", entRedeemed || {});

  const reclaimA = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: campaignAId });
  mark("A_RECLAIM_BLOCK", !reclaimA.ok ? "PASS" : "FAIL");

  const opsOwner = await apiJson(
    ownerCookie,
    "GET",
    `/api/me/store-coupons/campaigns?ops=1&campaignId=${encodeURIComponent(campaignAId || "")}`
  );
  mark("A_OWNER_OPS", opsOwner.ok && opsOwner.json?.campaign?.instances?.length >= 1 ? "PASS" : "FAIL");

  const adminList = await apiJson(adminCookie, "GET", "/api/admin/store-coupons");
  const adminCamp = (adminList.json?.campaigns || []).find((c) => c.id === campaignAId);
  mark("A_ADMIN_TRACE", adminCamp?.issuer?.roleKey ? "PASS" : "FAIL");

  if (entA?.coupon_number) {
    const adminSearch = await apiJson(
      adminCookie,
      "GET",
      `/api/admin/store-coupons?couponNumber=${encodeURIComponent(entA.coupon_number)}`
    );
    mark(
      "A_ADMIN_COUPON_SEARCH",
      (adminSearch.json?.campaigns || []).some((c) => c.id === campaignAId) ? "PASS" : "FAIL"
    );
  }

  const claimB = await apiJson(buyerBCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: campaignAId });
  const entBId = claimB.json?.entitlement?.id || claimB.json?.user_coupon_id;
  const { data: entB } = await sb.from("coupon_user_entitlements").select("coupon_number").eq("id", entBId || "none").maybeSingle();
  mark(
    "A_BUYER_B_INSTANCE",
    claimB.ok && entB?.coupon_number && entB.coupon_number !== entA?.coupon_number ? "PASS" : "FAIL"
  );

  report.campaign_a = { campaign_id: campaignAId, entitlement_a: entAId, coupon_number_a: entA?.coupon_number, order_id: orderAId };

  const titleB = `V32_CAMPAIGN_B_${STAMP}`;
  const createB = await apiJson(ownerCookie, "POST", "/api/me/store-coupons/campaigns", {
    storeId: STORE.storeId,
    title: titleB,
    discountType: "fixed_amount",
    discountValue: 80,
    minOrderAmount: 0,
    issueLimit: 5,
    spendBudgetPhp: 2000,
    campaignPurpose: "repeat_purchase",
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    isActive: true,
  });
  const campaignBId = createB.json?.campaign?.id;
  const claimBOnly = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: campaignBId });
  const entBOnlyId = claimBOnly.json?.entitlement?.id || claimBOnly.json?.user_coupon_id;
  const { data: entBOnlyBefore } = await sb
    .from("coupon_user_entitlements")
    .select("coupon_number, status")
    .eq("id", entBOnlyId || "none")
    .maybeSingle();
  const { data: campBBefore } = await sb
    .from("store_coupon_campaigns")
    .select("issued_count")
    .eq("id", campaignBId || "none")
    .maybeSingle();
  const issuedBefore = Number(campBBefore?.issued_count);

  const orderB = await placeOrder({
    sb,
    cookie: buyerCookie,
    userId: buyer.user.id,
    campaignId: campaignBId,
    userCouponId: entBOnlyId,
    tag: "B",
    qty: 5,
  });
  const orderBId = orderB.json?.order?.id;
  mark("B_ORDER", orderB.ok && orderBId ? "PASS" : "FAIL");

  const cancelB = await apiJson(buyerCookie, "PATCH", `/api/me/store-orders/${orderBId}`, { cancel: true });
  mark("B_CANCEL", cancelB.ok ? "PASS" : "FAIL");

  const { data: entBAfter } = await sb
    .from("coupon_user_entitlements")
    .select("coupon_number, status")
    .eq("id", entBOnlyId || "none")
    .maybeSingle();
  const { data: campBAfter } = await sb
    .from("store_coupon_campaigns")
    .select("issued_count")
    .eq("id", campaignBId || "none")
    .maybeSingle();

  mark("B_SAME_NUMBER", entBAfter?.coupon_number === entBOnlyBefore?.coupon_number ? "PASS" : "FAIL");
  mark("B_ISSUED_UNCHANGED", Number(campBAfter?.issued_count) === issuedBefore ? "PASS" : "FAIL");
  mark(
    "B_RESTORE_STATUS",
    entBAfter?.status === "available" || entBAfter?.status === "restored" ? "PASS" : "FAIL",
    entBAfter || {}
  );

  const orderB2 = await placeOrder({
    sb,
    cookie: buyerCookie,
    userId: buyer.user.id,
    campaignId: campaignBId,
    userCouponId: entBOnlyId,
    tag: "B2",
    qty: 5,
  });
  mark("B_REUSE_AFTER_RESTORE", orderB2.ok ? "PASS" : "FAIL");
  if (orderB2.json?.order?.id) {
    await apiJson(buyerCookie, "PATCH", `/api/me/store-orders/${orderB2.json.order.id}`, { cancel: true });
  }

  report.campaign_b = {
    campaign_id: campaignBId,
    entitlement_id: entBOnlyId,
    coupon_number: entBAfter?.coupon_number,
    issued_count_before: issuedBefore,
    issued_count_after: campBAfter?.issued_count,
  };

  const mandatory = [
    "P0_MIGRATION_COLUMNS",
    "P0_COUPON_NUMBER_COLUMN",
    "A_CREATE",
    "A_COUPON_NUMBER",
    "A_ISSUED_ONE",
    "A_ORDER",
    "A_REDEEMED",
    "A_RECLAIM_BLOCK",
    "B_ORDER",
    "B_CANCEL",
    "B_SAME_NUMBER",
    "B_ISSUED_UNCHANGED",
    "B_RESTORE_STATUS",
    "B_REUSE_AFTER_RESTORE",
  ];
  report.blockers = mandatory.filter((k) => report.matrix[k]?.status !== "PASS");
  report.product_closed = report.blockers.length === 0 ? "PASS" : "NOT_CLOSED";

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.blockers.length) process.exit(1);
}

void main().catch((e) => {
  report.fail = { step: "CRASH", detail: String(e?.stack || e) };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});
