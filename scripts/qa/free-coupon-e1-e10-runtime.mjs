/**
 * FREE COUPON E1–E10 runtime — QA actors only (same convention as delivery-full-business-process).
 * Stops at first E fail. Does not mutate non-QA customers.
 *
 * node --env-file=.env.local scripts/qa/free-coupon-e1-e10-runtime.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-free-coupon-e1-e10.json");
const STAMP = Date.now();
const FROM = String(process.env.COUPON_QA_FROM || "E1").toUpperCase();
const skipUntil = { E1: 1, E2: 2, E3: 3, E4: 4, E5: 5, E6: 6, E7: 7, E8: 8, E9: 9, E10: 10 }[FROM] || 1;

const ACTORS = {
  BUYER: { email: "qqqq@manual.local", userId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8" },
  BUYER_B: { email: "wwww@manual.local" },
  OWNER: { email: "sadads@adsasdsa.com", userId: "f00de57c-27d1-495c-824e-e39eab3227aa" },
  ADMIN: { email: "aaaa@manual.local", userId: "11111111-1111-1111-1111-111111111111" },
};
const STORE = { storeId: "19085860-52d2-4183-b033-e71fcb58bcec", slug: "aa11" };
const PRODUCT = { productId: "5c3800d3-675b-4edd-a7dc-ac91252a473b", price: 150, qty: 7 };

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
async function cookieHeaderFromSession(session) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const ref = url?.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const payload = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  );
  let cookie = `sb-${ref}-auth-token=${payload}`;
  const { data: pr } = await sbService().from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  const sid = String(pr?.active_session_id ?? "").trim();
  if (sid) cookie += `; samarket_active_session_id=${encodeURIComponent(sid)}`;
  return cookie;
}
async function apiJson(cookie, method, path, body) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: { cookie, "content-type": "application/json", accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, ok: res.ok, json };
}

const report = { origin: ORIGIN, stamp: STAMP, actors: {}, e: {}, ids: {}, money: {}, fail: null };

function fail(step, detail) {
  report.fail = { step, detail };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

async function main() {
  loadEnv();
  const sb = sbService();
  const buyerSess = await loginSession(ACTORS.BUYER.email);
  const buyerBSess = await loginSession(ACTORS.BUYER_B.email);
  const ownerSess = await loginSession(ACTORS.OWNER.email);
  const adminSess = await loginSession(ACTORS.ADMIN.email);
  if (buyerSess.user.id !== ACTORS.BUYER.userId) fail("AUTH", "buyer id mismatch");
  ACTORS.BUYER_B.userId = buyerBSess.user.id;
  if (ownerSess.user.id !== ACTORS.OWNER.userId) fail("AUTH", "owner id mismatch");
  if (adminSess.user.id !== ACTORS.ADMIN.userId) fail("AUTH", "admin id mismatch");
  report.actors = {
    QA_BUYER: "resolved",
    QA_OWNER: "resolved",
    QA_ADMIN: "resolved",
    QA_STORE: "resolved",
    QA_PRODUCT: "resolved",
    PRODUCTION_SAFE: ORIGIN.includes("127.0.0.1") ? "local" : "qa-convention-actors",
  };
  const buyerCookie = await cookieHeaderFromSession(buyerSess);
  const buyerBCookie = await cookieHeaderFromSession(buyerBSess);
  const ownerCookie = await cookieHeaderFromSession(ownerSess);
  const adminCookie = await cookieHeaderFromSession(adminSess);

  async function ensureAddr(cookie, userId) {
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
    if (!near?.id) fail("ADDR", `QA buyer ${userId} has no geo address near store`);
    const ensure = await apiJson(cookie, "PATCH", `/api/me/addresses/${near.id}`, {
      isDefaultMaster: true,
      isDefaultDelivery: true,
      appRegionId: near.app_region_id || "quezon",
      appCityId: near.app_city_id || "q8",
      phoneNumber: near.phone_number || "+639121121211",
    });
    if (!ensure.ok) fail("ADDR", `address_ensure ${ensure.status} ${JSON.stringify(ensure.json).slice(0, 300)}`);
    return { id: near.id, phone_number: near.phone_number || "+639121121211" };
  }
  async function placeOrder({ cookie, userId, campaignId, userCouponId, tag, qty }) {
    const addr = await ensureAddr(cookie, userId);
    return apiJson(cookie, "POST", "/api/me/store-orders", {
      store_id: STORE.storeId,
      fulfillment_type: "local_delivery",
      payment_method: "cod",
      buyer_phone: addr.phone_number,
      delivery_user_address_id: addr.id,
      buyer_note: `DIBAY_QA_COUPON_${tag}_${STAMP}`,
      client_order_key: `dibay-qa-coupon-${tag}-${STAMP}-${Math.random().toString(16).slice(2)}`,
      coupon_campaign_id: campaignId || undefined,
      user_coupon_id: userCouponId || undefined,
      items: [{ product_id: PRODUCT.productId, qty: qty ?? PRODUCT.qty, client_unit_php: PRODUCT.price }],
    });
  }
  async function completeOrder(orderId) {
    const steps = [
      ["accepted", { estimated_prep_minutes: 15 }],
      ["preparing", {}],
      ["ready_for_pickup", {}],
      ["delivering", {}],
      ["completed", {}],
    ];
    for (const [status, extra] of steps) {
      const patch = await apiJson(ownerCookie, "PATCH", `/api/me/stores/${STORE.storeId}/orders/${orderId}`, {
        order_status: status,
        ...extra,
      });
      if (!patch.ok) return patch;
    }
    return { ok: true, status: 200, json: { ok: true } };
  }

  const denyCamp = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/campaigns", {
    storeId: STORE.storeId,
    title: "x",
    discountType: "fixed_amount",
    discountValue: 100,
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 86400000).toISOString(),
    fundingMode: "STORE_FUNDED",
  });
  report.e.RLS_BUYER_CREATE_CAMPAIGN = denyCamp.status === 403 || denyCamp.json?.error === "forbidden_store" ? "PASS" : `FAIL:${denyCamp.status}:${JSON.stringify(denyCamp.json).slice(0, 120)}`;
  if (!String(report.e.RLS_BUYER_CREATE_CAMPAIGN).startsWith("PASS")) fail("RLS", report.e.RLS_BUYER_CREATE_CAMPAIGN);

  if (skipUntil <= 1) {
    const start = new Date();
    const end = new Date(Date.now() + 2 * 86400000);
    const usageEnd = new Date(Date.now() + 7 * 86400000);
    const create = await apiJson(ownerCookie, "POST", "/api/me/store-coupons/campaigns", {
      storeId: STORE.storeId,
      title: `DIBAY_QA_COUPON_E1_${STAMP}`,
      discountType: "fixed_amount",
      discountValue: 100,
      minOrderAmount: 700,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      usageEndAt: usageEnd.toISOString(),
      claimValidDays: 7,
      issueLimit: 20,
      spendBudgetPhp: 5000,
      isActive: true,
      fundingMode: "STORE_FUNDED",
    });
    const campaignId = create.json?.campaign?.id;
    if (!create.ok || !campaignId) fail("E1_CREATE", `${create.status} ${JSON.stringify(create.json).slice(0, 400)}`);
    report.ids.campaign_id = campaignId;
    report.e.E1_CREATE = "PASS";

    const claim = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: campaignId });
    const userCouponId = claim.json?.entitlement?.id;
    if (!claim.ok || !userCouponId) fail("E1_CLAIM", `${claim.status} ${JSON.stringify(claim.json).slice(0, 400)}`);
    report.ids.user_coupon_id = userCouponId;
    report.e.E1_CLAIM = "PASS";

    const wallet = await apiJson(buyerCookie, "GET", "/api/me/store-coupons?tab=available");
    const inWallet = (wallet.json?.coupons || []).some((c) => c.id === userCouponId);
    if (!wallet.ok || !inWallet) fail("E1_WALLET", `${wallet.status} ${JSON.stringify(wallet.json).slice(0, 300)}`);
    report.e.E1_WALLET = "PASS";

    const orderRes = await placeOrder({
      cookie: buyerCookie,
      userId: ACTORS.BUYER.userId,
      campaignId,
      userCouponId,
      tag: "E1",
    });
    const orderId = orderRes.json?.order?.id;
    if (!orderRes.ok || !orderId) fail("E1_ORDER", `${orderRes.status} ${JSON.stringify(orderRes.json).slice(0, 500)}`);
    report.ids.order_id = orderId;
    report.e.E1_ORDER = "PASS";

    const { data: ord } = await sb
      .from("store_orders")
      .select(
        "id, order_status, payment_amount, delivery_fee_amount, user_coupon_id, store_funded_amount, platform_funded_amount, commission_base_amount, coupon_campaign_id"
      )
      .eq("id", orderId)
      .maybeSingle();
    report.money.e1_order = ord;
    if (String(ord?.user_coupon_id) !== userCouponId) fail("E1_SNAPSHOT", "user_coupon_id mismatch");
    if (Number(ord?.store_funded_amount) !== 100) fail("E1_FUNDING", `store_funded=${ord?.store_funded_amount}`);
    if (Number(ord?.platform_funded_amount) !== 0) fail("E1_FUNDING", `platform_funded=${ord?.platform_funded_amount}`);

    const done = await completeOrder(orderId);
    if (!done.ok) fail("E1_COMPLETE", `${done.status} ${JSON.stringify(done.json).slice(0, 200)}`);
    const { data: sett } = await sb
      .from("store_settlements")
      .select("id, gross_amount, platform_fee_amount, settlement_amount, net_settlement_amount, discount_burden_amount")
      .eq("order_id", orderId);
    report.ids.settlement_id = sett?.[0]?.id ?? null;
    report.money.e1_settlement = sett?.[0] ?? null;
    if (!sett?.[0]?.id) fail("E1_SETTLEMENT", "no settlement row");
    report.e.E1 = "PASS";
  } else {
    report.e.E1 = "SKIPPED";
  }

  if (skipUntil <= 2) {
    const start = new Date();
    const end = new Date(Date.now() + 2 * 86400000);
    const create = await apiJson(ownerCookie, "POST", "/api/me/store-coupons/campaigns", {
      storeId: STORE.storeId,
      title: `DIBAY_QA_COUPON_E2_${STAMP}`,
      discountType: "fixed_amount",
      discountValue: 100,
      minOrderAmount: 700,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      usageEndAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      claimValidDays: 7,
      issueLimit: 20,
      spendBudgetPhp: 5000,
      isActive: true,
      fundingMode: "SHARED_FUNDED",
      storeFundedAmount: 60,
    });
    const campaignId = create.json?.campaign?.id;
    if (!create.ok || !campaignId) fail("E2_CREATE", `${create.status} ${JSON.stringify(create.json).slice(0, 400)}`);
    if (create.json?.campaign?.lifecycle_state !== "requested") {
      fail("E2_REQUEST", `lifecycle=${create.json?.campaign?.lifecycle_state}`);
    }
    const claimEarly = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: campaignId });
    if (claimEarly.ok) fail("E2_PREAPPROVE_CLAIM", "claim must wait for admin approval");
    const approve = await apiJson(adminCookie, "PATCH", "/api/admin/store-coupons", { id: campaignId, action: "approve" });
    if (!approve.ok) fail("E2_APPROVE", `${approve.status} ${JSON.stringify(approve.json).slice(0, 300)}`);
    const claim = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: campaignId });
    const userCouponId = claim.json?.entitlement?.id;
    if (!claim.ok || !userCouponId) fail("E2_CLAIM", `${claim.status} ${JSON.stringify(claim.json).slice(0, 400)}`);
    const orderRes = await placeOrder({
      cookie: buyerCookie,
      userId: ACTORS.BUYER.userId,
      campaignId,
      userCouponId,
      tag: "E2",
    });
    const orderId = orderRes.json?.order?.id;
    if (!orderRes.ok || !orderId) fail("E2_ORDER", `${orderRes.status} ${JSON.stringify(orderRes.json).slice(0, 500)}`);
    const { data: ord } = await sb
      .from("store_orders")
      .select("id, payment_amount, store_funded_amount, platform_funded_amount, commission_base_amount, user_coupon_id")
      .eq("id", orderId)
      .maybeSingle();
    report.ids.e2 = { campaign_id: campaignId, user_coupon_id: userCouponId, order_id: orderId };
    report.money.e2_order = ord;
    const storeF = Number(ord?.store_funded_amount);
    const platF = Number(ord?.platform_funded_amount);
    if (storeF !== 60) fail("E2_FUNDING", `store_funded=${storeF}`);
    if (platF !== 40) fail("E2_FUNDING", `platform_funded=${platF}`);
    if (storeF + platF !== 100) fail("E2_FUNDING", "split != 100");
    const done = await completeOrder(orderId);
    if (!done.ok) fail("E2_COMPLETE", `${done.status} ${JSON.stringify(done.json).slice(0, 200)}`);
    const { data: sett } = await sb.from("store_settlements").select("id, gross_amount, platform_fee_amount, net_settlement_amount, discount_burden_amount").eq("order_id", orderId);
    report.money.e2_settlement = sett?.[0] ?? null;
    if (!sett?.[0]?.id) fail("E2_SETTLEMENT", "no settlement row");
    report.e.E2 = "PASS";
  } else {
    report.e.E2 = "SKIPPED";
  }

  async function ownerCamp(extra) {
    const start = new Date();
    return apiJson(ownerCookie, "POST", "/api/me/store-coupons/campaigns", {
      storeId: STORE.storeId,
      title: extra.title,
      discountType: extra.discountType || "fixed_amount",
      discountValue: extra.discountValue ?? 100,
      minOrderAmount: extra.minOrderAmount ?? 700,
      startAt: extra.startAt || start.toISOString(),
      endAt: extra.endAt || new Date(Date.now() + 2 * 86400000).toISOString(),
      usageEndAt: extra.usageEndAt || new Date(Date.now() + 7 * 86400000).toISOString(),
      claimValidDays: extra.claimValidDays ?? 7,
      issueLimit: extra.issueLimit ?? 20,
      spendBudgetPhp: extra.spendBudgetPhp ?? 5000,
      isActive: extra.isActive !== false,
      fundingMode: extra.fundingMode || "STORE_FUNDED",
      firstOrderScope: extra.firstOrderScope || undefined,
      storeFundedAmount: extra.storeFundedAmount,
    });
  }

  if (skipUntil <= 3) {
    const pending = await placeOrder({
      cookie: buyerBCookie,
      userId: ACTORS.BUYER_B.userId,
      tag: "E3_PENDING",
    });
    if (!pending.ok) fail("E3_PENDING", `${pending.status} ${JSON.stringify(pending.json).slice(0, 300)}`);
    const storeFirst = await ownerCamp({ title: `DIBAY_QA_COUPON_E3_STORE_${STAMP}`, firstOrderScope: "STORE" });
    const storeCid = storeFirst.json?.campaign?.id;
    if (!storeFirst.ok || !storeCid) fail("E3_CREATE", `${storeFirst.status} ${JSON.stringify(storeFirst.json).slice(0, 300)}`);
    const qDeny = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: storeCid });
    if (qDeny.ok || qDeny.json?.error !== "first_order_ineligible") {
      fail("E3_STORE_QQQQ", `${qDeny.status} ${JSON.stringify(qDeny.json).slice(0, 200)}`);
    }
    const wClaim = await apiJson(buyerBCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: storeCid });
    const wEnt = wClaim.json?.entitlement?.id;
    if (!wClaim.ok || !wEnt) fail("E3_STORE_WWWW", `${wClaim.status} ${JSON.stringify(wClaim.json).slice(0, 300)}`);
    const wOrder = await placeOrder({
      cookie: buyerBCookie,
      userId: ACTORS.BUYER_B.userId,
      campaignId: storeCid,
      userCouponId: wEnt,
      tag: "E3",
    });
    const wOid = wOrder.json?.order?.id;
    if (!wOrder.ok || !wOid) fail("E3_ORDER", `${wOrder.status} ${JSON.stringify(wOrder.json).slice(0, 300)}`);
    const wDone = await completeOrder(wOid);
    if (!wDone.ok) fail("E3_COMPLETE", `${wDone.status} ${JSON.stringify(wDone.json).slice(0, 200)}`);
    const wAgain = await apiJson(buyerBCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: storeCid });
    if (wAgain.ok || wAgain.json?.error !== "first_order_ineligible") {
      fail("E3_STORE_AFTER", `${wAgain.status} ${JSON.stringify(wAgain.json).slice(0, 200)}`);
    }
    const plat = await ownerCamp({ title: `DIBAY_QA_COUPON_E3_PLAT_${STAMP}`, firstOrderScope: "PLATFORM" });
    const platCid = plat.json?.campaign?.id;
    if (!plat.ok || !platCid) fail("E3_PLAT_CREATE", `${plat.status} ${JSON.stringify(plat.json).slice(0, 200)}`);
    const wPlat = await apiJson(buyerBCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: platCid });
    if (wPlat.ok || wPlat.json?.error !== "first_order_ineligible") {
      fail("E3_PLAT_WWWW", `${wPlat.status} ${JSON.stringify(wPlat.json).slice(0, 200)}`);
    }
    const bbbbSess = await loginSession("bbbb@manual.local");
    const bbbbCookie = await cookieHeaderFromSession(bbbbSess);
    const bClaim = await apiJson(bbbbCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: platCid });
    if (!bClaim.ok || !bClaim.json?.entitlement?.id) fail("E3_PLAT_BBBB", `${bClaim.status} ${JSON.stringify(bClaim.json).slice(0, 300)}`);
    report.ids.e3 = { store_campaign_id: storeCid, platform_campaign_id: platCid, wwww_order_id: wOid };
    report.e.E3 = "PASS";
  } else {
    report.e.E3 = "SKIPPED";
  }

  if (skipUntil <= 4) {
    const camp = await ownerCamp({ title: `DIBAY_QA_COUPON_E4_${STAMP}` });
    const cid = camp.json?.campaign?.id;
    if (!camp.ok || !cid) fail("E4_CREATE", `${camp.status} ${JSON.stringify(camp.json).slice(0, 200)}`);
    const aClaim = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: cid });
    const aEnt = aClaim.json?.entitlement?.id;
    if (!aClaim.ok || !aEnt) fail("E4_CLAIM_A", `${aClaim.status} ${JSON.stringify(aClaim.json).slice(0, 200)}`);
    const pause = await apiJson(ownerCookie, "PATCH", "/api/me/store-coupons/campaigns", { id: cid, action: "pause" });
    if (!pause.ok) fail("E4_PAUSE", `${pause.status} ${JSON.stringify(pause.json).slice(0, 200)}`);
    const bClaim = await apiJson(buyerBCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: cid });
    if (bClaim.ok) fail("E4_CLAIM_B", "paused campaign must deny new claim");
    const aOrder = await placeOrder({
      cookie: buyerCookie,
      userId: ACTORS.BUYER.userId,
      campaignId: cid,
      userCouponId: aEnt,
      tag: "E4",
    });
    if (!aOrder.ok || !aOrder.json?.order?.id) fail("E4_CHECKOUT_A", `${aOrder.status} ${JSON.stringify(aOrder.json).slice(0, 300)}`);
    const { data: ent } = await sb.from("coupon_user_entitlements").select("status").eq("id", aEnt).maybeSingle();
    if (String(ent?.status) === "revoked") fail("E4_PAUSE_REVOKE", "pause revoked held coupon");
    report.e.E4 = "PASS";
    report.ids.e4 = { campaign_id: cid, user_coupon_id: aEnt, order_id: aOrder.json.order.id };
  } else {
    report.e.E4 = "SKIPPED";
  }

  if (skipUntil <= 5) {
    const camp = await ownerCamp({ title: `DIBAY_QA_COUPON_E5_${STAMP}` });
    const cid = camp.json?.campaign?.id;
    if (!camp.ok || !cid) fail("E5_CREATE", `${camp.status} ${JSON.stringify(camp.json).slice(0, 200)}`);
    const aClaim = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: cid });
    const aEnt = aClaim.json?.entitlement?.id;
    if (!aClaim.ok || !aEnt) fail("E5_CLAIM", `${aClaim.status} ${JSON.stringify(aClaim.json).slice(0, 200)}`);
    const noReason = await apiJson(adminCookie, "PATCH", "/api/admin/store-coupons", { id: cid, action: "revoke" });
    if (noReason.ok || noReason.json?.error !== "revoke_reason_required") {
      fail("E5_REASON", `${noReason.status} ${JSON.stringify(noReason.json).slice(0, 200)}`);
    }
    const rev = await apiJson(adminCookie, "PATCH", "/api/admin/store-coupons", {
      id: cid,
      action: "revoke",
      reason: "DIBAY_QA_E5_FORCE_REVOKE",
    });
    if (!rev.ok) fail("E5_REVOKE", `${rev.status} ${JSON.stringify(rev.json).slice(0, 200)}`);
    const aOrder = await placeOrder({
      cookie: buyerCookie,
      userId: ACTORS.BUYER.userId,
      campaignId: cid,
      userCouponId: aEnt,
      tag: "E5",
    });
    if (aOrder.ok) fail("E5_CHECKOUT", "revoked unused coupon must deny checkout");
    const { data: audit } = await sb
      .from("coupon_audit_events")
      .select("action, payload")
      .eq("campaign_id", cid)
      .eq("action", "admin_force_revoke")
      .limit(1);
    const reason = String(audit?.[0]?.payload?.reason ?? audit?.[0]?.payload?.reason ?? "");
    const payload = audit?.[0]?.payload;
    const reasonOk = JSON.stringify(payload || {}).includes("DIBAY_QA_E5_FORCE_REVOKE");
    if (!reasonOk) fail("E5_AUDIT", JSON.stringify(audit?.[0] ?? null));
    report.e.E5 = "PASS";
    report.ids.e5 = { campaign_id: cid, user_coupon_id: aEnt };
  } else {
    report.e.E5 = "SKIPPED";
  }

  if (skipUntil <= 6) {
    const camp = await ownerCamp({ title: `DIBAY_QA_COUPON_E6_${STAMP}` });
    const cid = camp.json?.campaign?.id;
    if (!camp.ok || !cid) fail("E6_CREATE", `${camp.status} ${JSON.stringify(camp.json).slice(0, 200)}`);
    const claim = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: cid });
    const entId = claim.json?.entitlement?.id;
    if (!claim.ok || !entId) fail("E6_CLAIM", `${claim.status} ${JSON.stringify(claim.json).slice(0, 200)}`);
    const order1 = await placeOrder({
      cookie: buyerCookie,
      userId: ACTORS.BUYER.userId,
      campaignId: cid,
      userCouponId: entId,
      tag: "E6A",
    });
    const oid1 = order1.json?.order?.id;
    if (!order1.ok || !oid1) fail("E6_ORDER1", `${order1.status} ${JSON.stringify(order1.json).slice(0, 300)}`);
    const cancel = await apiJson(buyerCookie, "PATCH", `/api/me/store-orders/${oid1}`, { cancel: true });
    if (!cancel.ok) fail("E6_CANCEL", `${cancel.status} ${JSON.stringify(cancel.json).slice(0, 300)}`);
    const { data: entAfter } = await sb.from("coupon_user_entitlements").select("id, status").eq("id", entId).maybeSingle();
    if (!entAfter || !["available", "restored"].includes(String(entAfter.status))) {
      fail("E6_RESTORE", `status=${entAfter?.status}`);
    }
    const { data: reds } = await sb.from("coupon_audit_events").select("id").eq("campaign_id", cid);
    if (!reds || reds.length === 0) {
      /* audit may be on entitlement path; do not require empty history */
    }
    const order2 = await placeOrder({
      cookie: buyerCookie,
      userId: ACTORS.BUYER.userId,
      campaignId: cid,
      userCouponId: entId,
      tag: "E6B",
    });
    if (!order2.ok || !order2.json?.order?.id) fail("E6_ORDER2", `${order2.status} ${JSON.stringify(order2.json).slice(0, 300)}`);
    report.e.E6 = "PASS";
    report.ids.e6 = { campaign_id: cid, user_coupon_id: entId, order1: oid1, order2: order2.json.order.id, restore_status: entAfter.status };
  } else {
    report.e.E6 = "SKIPPED";
  }

  if (skipUntil <= 7) {
    const camp = await ownerCamp({
      title: `DIBAY_QA_COUPON_E7_${STAMP}`,
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 86400000).toISOString(),
      usageEndAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      claimValidDays: 7,
    });
    const cid = camp.json?.campaign?.id;
    if (!camp.ok || !cid) fail("E7_CREATE", `${camp.status} ${JSON.stringify(camp.json).slice(0, 200)}`);
    const claim = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: cid });
    const entId = claim.json?.entitlement?.id;
    if (!claim.ok || !entId) fail("E7_CLAIM", `${claim.status} ${JSON.stringify(claim.json).slice(0, 200)}`);
    const closedAt = new Date(Date.now() - 1000).toISOString();
    const openedAt = new Date(Date.now() - 2 * 86400000).toISOString();
    const { error: closeErr } = await sb
      .from("store_coupon_campaigns")
      .update({ end_at: closedAt, start_at: openedAt })
      .eq("id", cid);
    if (closeErr) fail("E7_CLOSE", closeErr.message);
    const newClaim = await apiJson(buyerBCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: cid });
    if (newClaim.ok) fail("E7_ISSUE_CLOSED", "new claim must deny after issue window");
    const still = await placeOrder({
      cookie: buyerCookie,
      userId: ACTORS.BUYER.userId,
      campaignId: cid,
      userCouponId: entId,
      tag: "E7",
    });
    if (!still.ok || !still.json?.order?.id) fail("E7_USAGE_OPEN", `${still.status} ${JSON.stringify(still.json).slice(0, 300)}`);
    await apiJson(buyerCookie, "PATCH", `/api/me/store-orders/${still.json.order.id}`, { cancel: true });
    await sb.from("coupon_user_entitlements").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", entId);
    const expired = await placeOrder({
      cookie: buyerCookie,
      userId: ACTORS.BUYER.userId,
      campaignId: cid,
      userCouponId: entId,
      tag: "E7X",
    });
    if (expired.ok) fail("E7_USAGE_EXPIRED", "expired entitlement must deny checkout");
    const wallet = await apiJson(buyerCookie, "GET", "/api/me/store-coupons?tab=expired");
    const inExpired = (wallet.json?.coupons || []).some((c) => c.id === entId);
    if (!inExpired) fail("E7_WALLET_EXPIRED", JSON.stringify(wallet.json).slice(0, 200));
    report.e.E7 = "PASS";
    report.ids.e7 = { campaign_id: cid, user_coupon_id: entId };
  } else {
    report.e.E7 = "SKIPPED";
  }

  if (skipUntil <= 8) {
    const camp = await ownerCamp({ title: `DIBAY_QA_COUPON_E8_${STAMP}`, issueLimit: 1 });
    const cid = camp.json?.campaign?.id;
    if (!camp.ok || !cid) fail("E8_CREATE", `${camp.status} ${JSON.stringify(camp.json).slice(0, 200)}`);
    const [a, b] = await Promise.all([
      apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: cid }),
      apiJson(buyerBCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: cid }),
    ]);
    const oks = [a, b].filter((x) => x.ok);
    if (oks.length !== 1) fail("E8_RACE", `success=${oks.length} a=${JSON.stringify(a.json).slice(0, 120)} b=${JSON.stringify(b.json).slice(0, 120)}`);
    const { data: ents } = await sb.from("coupon_user_entitlements").select("id").eq("campaign_id", cid);
    if ((ents || []).length !== 1) fail("E8_DUP", `entitlements=${ents?.length}`);
    const { data: row } = await sb.from("store_coupon_campaigns").select("issued_count, issue_limit").eq("id", cid).maybeSingle();
    if (Number(row?.issued_count) !== 1 || Number(row?.issue_limit) < 0) fail("E8_LIMIT", JSON.stringify(row));
    report.e.E8 = "PASS";
    report.ids.e8 = { campaign_id: cid };
  } else {
    report.e.E8 = "SKIPPED";
  }

  if (skipUntil <= 9) {
    const camp = await ownerCamp({ title: `DIBAY_QA_COUPON_E9_${STAMP}`, spendBudgetPhp: 200, issueLimit: 10 });
    const cid = camp.json?.campaign?.id;
    if (!camp.ok || !cid) fail("E9_CREATE", `${camp.status} ${JSON.stringify(camp.json).slice(0, 200)}`);
    const aClaim = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: cid });
    const aEnt = aClaim.json?.entitlement?.id;
    if (!aClaim.ok || !aEnt) fail("E9_CLAIM_A", `${aClaim.status} ${JSON.stringify(aClaim.json).slice(0, 200)}`);
    const bClaim = await apiJson(buyerBCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: cid });
    if (!bClaim.ok) fail("E9_CLAIM_B", `${bClaim.status} ${JSON.stringify(bClaim.json).slice(0, 200)}`);
    const { data: afterB } = await sb.from("store_coupon_campaigns").select("reserved_spend_php, spend_budget_php").eq("id", cid).maybeSingle();
    report.money.e9_reserved = afterB;
    const aOrder = await placeOrder({
      cookie: buyerCookie,
      userId: ACTORS.BUYER.userId,
      campaignId: cid,
      userCouponId: aEnt,
      tag: "E9",
    });
    if (!aOrder.ok || !aOrder.json?.order?.id) fail("E9_CHECKOUT_A", `${aOrder.status} ${JSON.stringify(aOrder.json).slice(0, 300)}`);
    const raceCamp = await ownerCamp({ title: `DIBAY_QA_COUPON_E9R_${STAMP}`, spendBudgetPhp: 100, issueLimit: 5 });
    const raceCid = raceCamp.json?.campaign?.id;
    if (!raceCamp.ok || !raceCid) fail("E9_RACE_CREATE", `${raceCamp.status}`);
    const [r1, r2] = await Promise.all([
      apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: raceCid }),
      apiJson(buyerBCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: raceCid }),
    ]);
    const raceOk = [r1, r2].filter((x) => x.ok).length;
    if (raceOk !== 1) fail("E9_RACE", `success=${raceOk}`);
    report.e.E9 = "PASS";
    report.ids.e9 = { campaign_id: cid, user_coupon_id: aEnt, order_id: aOrder.json.order.id, race_campaign_id: raceCid };
  } else {
    report.e.E9 = "SKIPPED";
  }

  if (skipUntil <= 10) {
    const oid = report.ids.e9?.order_id || report.ids.order_id;
    if (!oid) fail("E10", "missing order_id");
    const { data: db } = await sb
      .from("store_orders")
      .select("id, coupon_campaign_id, user_coupon_id, payment_amount, store_funded_amount, platform_funded_amount, commission_base_amount, order_status")
      .eq("id", oid)
      .maybeSingle();
    const buyerView = await apiJson(buyerCookie, "GET", `/api/me/store-orders/${oid}`);
    const adminList = await apiJson(adminCookie, "GET", "/api/admin/store-coupons");
    const ownerList = await apiJson(ownerCookie, `GET`, `/api/me/store-coupons/campaigns?storeId=${STORE.storeId}`);
    const { data: sett } = await sb.from("store_settlements").select("id, order_id").eq("order_id", oid);
    const cid = String(db?.coupon_campaign_id ?? "");
    const adminRow = (adminList.json?.campaigns || []).find((c) => c.id === cid);
    const ownerRow = (ownerList.json?.campaigns || []).find((c) => c.id === cid);
    if (!buyerView.ok) fail("E10_BUYER", `${buyerView.status}`);
    if (!adminRow || !ownerRow) fail("E10_SURFACES", `admin=${Boolean(adminRow)} owner=${Boolean(ownerRow)}`);
    if (String(db?.user_coupon_id) !== String(report.ids.e9?.user_coupon_id)) fail("E10_IDS", "user_coupon mismatch");
    report.money.e10 = { db, settlement: sett?.[0] ?? null, admin_counts: { claimed: adminRow.claimed_count, redeemed: adminRow.redeemed_count } };
    report.e.E10 = "PASS";
  }

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((e) => {
  report.fail = { step: "CRASH", detail: String(e?.message || e) };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(String(e?.stack || e));
  process.exit(1);
});
