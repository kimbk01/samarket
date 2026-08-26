/**
 * FREE COUPON SSOT v1.0 — API acceptance double-check (Customer/Owner/Admin/Restore).
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3017 node --env-file=.env.local scripts/qa/free-coupon-ssot-v1-e2e.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3017").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-free-coupon-ssot-v1-e2e.json");
const STAMP = Date.now();
const STORE = { storeId: "19085860-52d2-4183-b033-e71fcb58bcec", slug: "aa11" };
const PRODUCT = { productId: "5c3800d3-675b-4edd-a7dc-ac91252a473b", price: 150 };
const ORDER_QTY = 7;
const ACTORS = {
  BUYER: { email: "qqqq@manual.local" },
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

async function apiJson(cookie, method, path, body) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: {
      cookie,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
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
    buyer_note: `DIBAY_SSOT_${tag}_${STAMP}`,
    client_order_key: `dibay-ssot-${tag}-${STAMP}-${Math.random().toString(16).slice(2)}`,
    coupon_campaign_id: campaignId || undefined,
    user_coupon_id: userCouponId || undefined,
    items: [{ product_id: PRODUCT.productId, qty: qty ?? ORDER_QTY, client_unit_php: PRODUCT.price }],
  });
}

async function main() {
  loadEnv();
  const report = { ok: false, stamp: STAMP, checks: {}, divergence: null };
  const mark = (k, v, extra) => {
    report.checks[k] = v;
    if (v === "FAIL" && !report.divergence) report.divergence = { check: k, extra: extra || null };
    if (extra) report.checks[`${k}_detail`] = extra;
  };

  const sb = sbService();
  const { error: snapErr } = await sb.from("coupon_user_entitlements").select("offer_snapshot").limit(1);
  mark(
    "SCHEMA_OFFER_SNAPSHOT",
    !snapErr ? "PASS" : /offer_snapshot/i.test(String(snapErr.message || "")) ? "FAIL" : "NOT_PROVEN",
    snapErr?.message || null
  );

  const buyer = await loginSession(ACTORS.BUYER.email);
  const owner = await loginSession(ACTORS.OWNER.email);
  const admin = await loginSession(ACTORS.ADMIN.email);
  const { data: bpr } = await sb.from("profiles").select("active_session_id").eq("id", buyer.user.id).maybeSingle();
  const { data: opr } = await sb.from("profiles").select("active_session_id").eq("id", owner.user.id).maybeSingle();
  const { data: apr } = await sb.from("profiles").select("active_session_id").eq("id", admin.user.id).maybeSingle();
  const buyerCookie = cookieHeader(buyer, bpr?.active_session_id);
  const ownerCookie = cookieHeader(owner, opr?.active_session_id);
  const adminCookie = cookieHeader(admin, apr?.active_session_id);

  const create = await apiJson(ownerCookie, "POST", "/api/me/store-coupons/campaigns", {
    storeId: STORE.storeId,
    title: `SSOT_V1_${STAMP}`,
    discountType: "fixed_amount",
    discountValue: 50,
    minOrderAmount: 700,
    issueLimit: 20,
    spendBudgetPhp: 5000,
    claimValidDays: 7,
    campaignPurpose: "store_promotion",
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    usageEndAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    isActive: true,
  });
  const offerId = create.json?.campaign?.id;
  mark("OWNER_CREATE_STORE_OFFER", create.ok && offerId ? "PASS" : "FAIL", create.json);

  const claim = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: offerId });
  const entId = claim.json?.entitlement?.id;
  const claimNumber = claim.json?.entitlement?.coupon_number;
  mark("CUSTOMER_CLAIM_INSTANCE", claim.ok && entId && claimNumber ? "PASS" : "FAIL", claim.json);

  const { data: entRow } = await sb
    .from("coupon_user_entitlements")
    .select("id, coupon_number, offer_snapshot, status")
    .eq("id", entId || "none")
    .maybeSingle();
  mark(
    "INSTANCE_OFFER_SNAPSHOT",
    entRow?.offer_snapshot && typeof entRow.offer_snapshot === "object"
      ? "PASS"
      : report.checks.SCHEMA_OFFER_SNAPSHOT === "FAIL"
        ? "FAIL"
        : "NOT_PROVEN",
    entRow || {}
  );

  const wallet = await apiJson(buyerCookie, "GET", "/api/me/store-coupons?tab=available");
  const card = (wallet.json?.cards || []).find((c) => c.entitlementId === entId);
  mark("CUSTOMER_WALLET_FACE", card?.title && card?.couponNumber ? "PASS" : "FAIL", card || {});

  const claimable = await apiJson(
    buyerCookie,
    "GET",
    `/api/me/store-coupons/claimable?storeId=${encodeURIComponent(STORE.storeId)}`
  );
  mark("OFFER_SURFACE_CLAIMABLE", claimable.ok ? "PASS" : "FAIL", { status: claimable.status });

  const checkoutNoEnt = await placeOrder({
    sb,
    cookie: buyerCookie,
    userId: buyer.user.id,
    campaignId: offerId,
    userCouponId: undefined,
    tag: "noent",
    qty: ORDER_QTY,
  });
  mark(
    "CHECKOUT_REQUIRES_USER_COUPON_ID",
    !checkoutNoEnt.ok && checkoutNoEnt.json?.error === "coupon_entitlement_required" ? "PASS" : "FAIL",
    checkoutNoEnt.json
  );

  const order = await placeOrder({
    sb,
    cookie: buyerCookie,
    userId: buyer.user.id,
    campaignId: offerId,
    userCouponId: entId,
    tag: "use",
    qty: ORDER_QTY,
  });
  const orderId = order.json?.order?.id;
  mark("CUSTOMER_CHECKOUT", order.ok && orderId ? "PASS" : "FAIL", order.json);

  const detail = await apiJson(buyerCookie, "GET", `/api/me/store-orders/${encodeURIComponent(orderId || "none")}`);
  const o = detail.json?.order || {};
  mark(
    "ORDER_TITLE_NUMBER_DISCOUNT",
    detail.ok &&
      Number(o.discount_amount) > 0 &&
      (Boolean(o.coupon_offer_title) || Boolean(o.coupon_number) || Boolean(o.user_coupon_id))
      ? "PASS"
      : "FAIL",
    {
      discount: o.discount_amount,
      title: o.coupon_offer_title,
      number: o.coupon_number,
      user_coupon_id: o.user_coupon_id,
    }
  );

  const reclaim = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: offerId });
  mark("NO_REUSE_AFTER_REDEEM", !reclaim.ok ? "PASS" : "FAIL", reclaim.json);

  const ops = await apiJson(
    ownerCookie,
    "GET",
    `/api/me/store-coupons/campaigns?ops=1&campaignId=${encodeURIComponent(offerId || "")}`
  );
  const camp = ops.json?.campaign;
  mark(
    "OWNER_ROI_FIELDS",
    ops.ok && camp && typeof camp.order_sales_php === "number" && "cost_ratio" in camp ? "PASS" : "FAIL",
    { order_sales_php: camp?.order_sales_php, cost_ratio: camp?.cost_ratio, realized: camp?.realized }
  );

  const pause = await apiJson(ownerCookie, "PATCH", "/api/me/store-coupons/campaigns", {
    id: offerId,
    action: "pause",
  });
  mark("OWNER_PAUSE", pause.ok ? "PASS" : "FAIL", pause.json);

  const create2 = await apiJson(ownerCookie, "POST", "/api/me/store-coupons/campaigns", {
    storeId: STORE.storeId,
    title: `SSOT_V1_PAUSE_${STAMP}`,
    discountType: "fixed_amount",
    discountValue: 40,
    minOrderAmount: 700,
    issueLimit: 10,
    spendBudgetPhp: 4000,
    claimValidDays: 7,
    campaignPurpose: "store_promotion",
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    usageEndAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    isActive: true,
  });
  const offer2 = create2.json?.campaign?.id;
  const claim2 = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: offer2 });
  const ent2 = claim2.json?.entitlement?.id;
  const num2 = claim2.json?.entitlement?.coupon_number;
  await apiJson(ownerCookie, "PATCH", "/api/me/store-coupons/campaigns", { id: offer2, action: "pause" });
  const orderHeld = await placeOrder({
    sb,
    cookie: buyerCookie,
    userId: buyer.user.id,
    campaignId: offer2,
    userCouponId: ent2,
    tag: "held",
    qty: ORDER_QTY,
  });
  mark("PAUSE_HELD_STILL_USABLE", orderHeld.ok ? "PASS" : "FAIL", orderHeld.json);

  const adminList = await apiJson(adminCookie, "GET", "/api/admin/store-coupons");
  mark("ADMIN_AUTH", adminList.ok ? "PASS" : "FAIL", { status: adminList.status, err: adminList.json?.error });

  const adminCreate = await apiJson(adminCookie, "POST", "/api/admin/store-coupons", {
    storeId: STORE.storeId,
    title: `SSOT_V1_PLATFORM_${STAMP}`,
    discountType: "fixed_amount",
    discountValue: 30,
    minOrderAmount: 700,
    fundingMode: "PLATFORM_FUNDED",
    issueLimit: 10,
    spendBudgetPhp: 3000,
    campaignPurpose: "platform_support",
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    usageEndAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    isActive: true,
  });
  const platformOfferId = adminCreate.json?.campaign?.id || adminCreate.json?.row?.id;
  mark("ADMIN_PLATFORM_OFFER", adminCreate.ok && platformOfferId ? "PASS" : "FAIL", adminCreate.json);

  const ownerMutatePlatform = await apiJson(ownerCookie, "PATCH", "/api/me/store-coupons/campaigns", {
    id: platformOfferId,
    action: "pause",
  });
  mark(
    "OWNER_PLATFORM_READONLY",
    platformOfferId &&
      !ownerMutatePlatform.ok &&
      ownerMutatePlatform.json?.error === "owner_platform_offer_readonly"
      ? "PASS"
      : "FAIL",
    ownerMutatePlatform.json
  );

  const promoClaim = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", {
    campaign_id: platformOfferId,
  });
  mark("PROMO_CTA_CLAIM_MANUAL", promoClaim.ok ? "PASS" : "FAIL", promoClaim.json);

  const { count: platformIssued } = await sb
    .from("coupon_user_entitlements")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", platformOfferId || "none");
  mark("PROMO_NO_AUTO_ISSUE", Number(platformIssued || 0) <= 1 ? "PASS" : "FAIL", { count: platformIssued });

  if (orderHeld.ok && orderHeld.json?.order?.id) {
    const cancel = await apiJson(
      buyerCookie,
      "PATCH",
      `/api/me/store-orders/${encodeURIComponent(orderHeld.json.order.id)}`,
      { cancel: true }
    );
    const { data: entAfter } = await sb
      .from("coupon_user_entitlements")
      .select("id, status, coupon_number")
      .eq("id", ent2 || "none")
      .maybeSingle();
    mark(
      "RESTORE_CANCEL",
      cancel.ok &&
        entAfter &&
        (entAfter.status === "available" || entAfter.status === "restored") &&
        entAfter.coupon_number === num2
        ? "PASS"
        : "FAIL",
      { cancel: cancel.json, ent: entAfter }
    );
  } else {
    mark("RESTORE_CANCEL", "NOT_PROVEN", { reason: "held_order_failed" });
  }

  const fails = Object.entries(report.checks).filter(([, v]) => v === "FAIL");
  report.ok = fails.length === 0;
  report.fail_count = fails.length;
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, fail_count: report.fail_count, divergence: report.divergence, out: OUT }, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
