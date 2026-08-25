/**
 * FREE COUPON remaining close — R7 math, R8 RLS, R9 grant. Does not rerun E1–E10.
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3017 node --env-file=.env.local scripts/qa/free-coupon-remaining-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3017").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-free-coupon-remaining-proof.json");
const STAMP = Date.now();
const ACTORS = {
  BUYER: { email: "qqqq@manual.local", userId: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8" },
  BUYER_B: { email: "wwww@manual.local", userId: "edc8c2f0-2673-4ca8-9d63-92a609d556f4" },
  OWNER: { email: "sadads@adsasdsa.com", userId: "f00de57c-27d1-495c-824e-e39eab3227aa" },
  ADMIN: { email: "aaaa@manual.local", userId: "11111111-1111-1111-1111-111111111111" },
};
const STORE = { storeId: "19085860-52d2-4183-b033-e71fcb58bcec", slug: "aa11" };
const MENU = { productId: "8eb53d15-dc29-4b76-8c6b-43264c5674dd", list: 200, unit: 180, qtyM2: 5, qtyBelow: 4 };

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
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
function sbAnon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
}
async function loginSession(email) {
  const sb = sbAnon();
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) return data.session;
  }
  throw new Error(`login_failed:${email}`);
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
  return { cookie, ref, payload };
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

const report = { origin: ORIGIN, stamp: STAMP, r: {}, ids: {}, money: {}, fail: null };
function fail(step, detail) {
  report.fail = { step, detail };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 2;
  throw new Error(`FAIL:${step}`);
}

async function main() {
  loadEnv();
  const sb = sbService();
  const buyerSess = await loginSession(ACTORS.BUYER.email);
  const buyerBSess = await loginSession(ACTORS.BUYER_B.email);
  const ownerSess = await loginSession(ACTORS.OWNER.email);
  const adminSess = await loginSession(ACTORS.ADMIN.email);
  const buyerCookie = (await cookieHeaderFromSession(buyerSess)).cookie;
  const ownerCookie = (await cookieHeaderFromSession(ownerSess)).cookie;
  const adminCookie = (await cookieHeaderFromSession(adminSess)).cookie;

  const { data: storeGeo } = await sb.from("stores").select("lat,lng").eq("id", STORE.storeId).maybeSingle();
  const { data: addrs } = await sb
    .from("user_addresses")
    .select("id, phone_number, app_region_id, app_city_id, latitude, longitude")
    .eq("user_id", ACTORS.BUYER.userId)
    .eq("is_active", true);
  const dist = (a) => {
    const dlat = Number(a.latitude) - Number(storeGeo?.lat);
    const dlng = Number(a.longitude) - Number(storeGeo?.lng);
    return dlat * dlat + dlng * dlng;
  };
  const near = (addrs || []).filter((a) => a.latitude != null).sort((a, b) => dist(a) - dist(b))[0];
  await apiJson(buyerCookie, "PATCH", `/api/me/addresses/${near.id}`, {
    isDefaultMaster: true,
    isDefaultDelivery: true,
    appRegionId: near.app_region_id || "quezon",
    appCityId: near.app_city_id || "q8",
    phoneNumber: near.phone_number || "+639121121211",
  });

  const { data: hoursRow } = await sb.from("stores").select("business_hours_json").eq("id", STORE.storeId).maybeSingle();
  const hours = hoursRow?.business_hours_json && typeof hoursRow.business_hours_json === "object" ? { ...hoursRow.business_hours_json } : {};
  const prevMin = hours.min_order_php;
  hours.min_order_php = 700;
  await sb.from("stores").update({ business_hours_json: hours }).eq("id", STORE.storeId);
  const restoreMin = async () => {
    hours.min_order_php = prevMin;
    await sb.from("stores").update({ business_hours_json: hours }).eq("id", STORE.storeId);
  };
  globalThis.__restoreCouponMin = restoreMin;
  async function ownerCamp(extra) {
    const start = new Date();
    return apiJson(ownerCookie, "POST", "/api/me/store-coupons/campaigns", {
      storeId: STORE.storeId,
      title: extra.title,
      discountType: extra.discountType,
      discountValue: extra.discountValue,
      minOrderAmount: extra.minOrderAmount ?? 900,
      maxDiscount: extra.maxDiscount ?? (extra.discountType === "percent" ? 999 : null),
      startAt: start.toISOString(),
      endAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      usageEndAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      claimValidDays: 7,
      issueLimit: 20,
      spendBudgetPhp: 5000,
      isActive: true,
      fundingMode: "STORE_FUNDED",
    });
  }
  async function place(qty, campaignId, userCouponId, tag) {
    return apiJson(buyerCookie, "POST", "/api/me/store-orders", {
      store_id: STORE.storeId,
      fulfillment_type: "local_delivery",
      payment_method: "cod",
      buyer_phone: near.phone_number || "+639121121211",
      delivery_user_address_id: near.id,
      buyer_note: `DIBAY_QA_COUPON_${tag}_${STAMP}`,
      client_order_key: `dibay-qa-coupon-${tag}-${STAMP}-${qty}`,
      coupon_campaign_id: campaignId,
      user_coupon_id: userCouponId,
      items: [{ product_id: MENU.productId, qty, client_unit_php: MENU.unit }],
    });
  }

  const m2 = await ownerCamp({ title: `DIBAY_QA_M2_${STAMP}`, discountType: "percent", discountValue: 10 });
  const m2id = m2.json?.campaign?.id;
  if (!m2.ok || !m2id) fail("M2_CREATE", JSON.stringify(m2.json).slice(0, 200));
  const m2c = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: m2id });
  const m2e = m2c.json?.entitlement?.id;
  if (!m2c.ok || !m2e) fail("M2_CLAIM", JSON.stringify(m2c.json).slice(0, 200));
  const quote2 = await apiJson(buyerCookie, "GET", `/api/me/store-coupons/best-eligible?storeId=${STORE.storeId}&itemGrossPhp=900`);
  const q2 = (quote2.json?.quotes || []).find((x) => x.userCouponId === m2e);
  if (!quote2.ok || Number(q2?.discountAmount) !== 90) fail("M2_QUOTE", JSON.stringify(quote2.json).slice(0, 400));
  const m2o = await place(MENU.qtyM2, m2id, m2e, "M2");
  const m2oid = m2o.json?.order?.id;
  if (!m2o.ok || !m2oid) fail("M2_ORDER", JSON.stringify(m2o.json).slice(0, 400));
  const { data: m2row } = await sb
    .from("store_orders")
    .select("payment_amount, delivery_fee_amount, commission_base_amount, store_funded_amount")
    .eq("id", m2oid)
    .maybeSingle();
  if (Number(m2row?.store_funded_amount) !== 90) fail("M2_DISC", JSON.stringify(m2row));
  const m2pay = Number(m2row?.payment_amount);
  const m2del = Number(m2row?.delivery_fee_amount);
  const m2base = Number(m2row?.commission_base_amount);
  if (m2base !== 900 + m2del) fail("M2_BASE", JSON.stringify(m2row));
  if (m2pay !== 810 + m2del) fail("M2_PAY", JSON.stringify(m2row));
  report.r.M2 = "PASS";
  report.money.m2 = m2row;
  report.ids.m2 = { campaign_id: m2id, order_id: m2oid };

  const m3 = await ownerCamp({
    title: `DIBAY_QA_M3_${STAMP}`,
    discountType: "percent",
    discountValue: 10,
    maxDiscount: 50,
  });
  const m3id = m3.json?.campaign?.id;
  if (!m3.ok || !m3id) fail("M3_CREATE", JSON.stringify(m3.json).slice(0, 200));
  const m3c = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: m3id });
  const m3e = m3c.json?.entitlement?.id;
  if (!m3c.ok || !m3e) fail("M3_CLAIM", JSON.stringify(m3c.json).slice(0, 200));
  const m3o = await place(MENU.qtyM2, m3id, m3e, "M3");
  const m3oid = m3o.json?.order?.id;
  if (!m3o.ok || !m3oid) fail("M3_ORDER", JSON.stringify(m3o.json).slice(0, 400));
  const { data: m3row } = await sb.from("store_orders").select("store_funded_amount, commission_base_amount, payment_amount, delivery_fee_amount").eq("id", m3oid).maybeSingle();
  if (Number(m3row?.store_funded_amount) !== 50) fail("M3_CAP", JSON.stringify(m3row));
  report.r.M3 = "PASS";
  report.money.m3 = m3row;

  const m4 = await ownerCamp({ title: `DIBAY_QA_M4_${STAMP}`, discountType: "percent", discountValue: 10, minOrderAmount: 900 });
  const m4id = m4.json?.campaign?.id;
  const m4c = await apiJson(buyerCookie, "POST", "/api/me/store-coupons/claim", { campaign_id: m4id });
  const m4e = m4c.json?.entitlement?.id;
  const m4o = await place(MENU.qtyBelow, m4id, m4e, "M4");
  if (m4o.ok) fail("M4_SHOULD_DENY", JSON.stringify(m4o.json).slice(0, 200));
  if (m4o.json?.error !== "coupon_min_order") fail("M4_ERR", JSON.stringify(m4o.json).slice(0, 200));
  report.r.M4 = "PASS";

  const m5o = await place(MENU.qtyM2, m4id, m4e, "M5");
  if (!m5o.ok || !m5o.json?.order?.id) fail("M5_ALLOW", JSON.stringify(m5o.json).slice(0, 300));
  report.r.M5 = "PASS";
  report.ids.m5 = { order_id: m5o.json.order.id };

  const userSb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${buyerSess.access_token}` } },
  });
  const { data: ownEnt, error: ownErr } = await userSb.from("coupon_user_entitlements").select("id").eq("buyer_user_id", ACTORS.BUYER.userId).limit(1);
  if (ownErr || !ownEnt?.length) fail("R8_OWN_SELECT", ownErr?.message || "empty");
  const { data: otherEnt } = await userSb.from("coupon_user_entitlements").select("id").eq("buyer_user_id", ACTORS.BUYER_B.userId).limit(5);
  if ((otherEnt || []).length > 0) fail("R8_OTHER_SELECT", `leaked ${otherEnt.length}`);
  const ins = await userSb.from("coupon_user_entitlements").insert({
    campaign_id: m2id,
    buyer_user_id: ACTORS.BUYER.userId,
    store_id: STORE.storeId,
    status: "available",
    reserved_php: 1,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });
  if (!ins.error) fail("R8_INSERT", "buyer insert must deny");
  const fund = await userSb.from("store_orders").update({ store_funded_amount: 1 }).eq("id", m2oid);
  const { data: fundedAfter } = await sb.from("store_orders").select("store_funded_amount").eq("id", m2oid).maybeSingle();
  if (Number(fundedAfter?.store_funded_amount) === 1) fail("R8_FUNDING", `mutated via buyer jwt error=${fund.error?.message || "none"}`);
  const plat = await apiJson(ownerCookie, "POST", "/api/me/store-coupons/campaigns", {
    storeId: STORE.storeId,
    title: `DIBAY_QA_PLAT_${STAMP}`,
    discountType: "fixed_amount",
    discountValue: 10,
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 86400000).toISOString(),
    isActive: true,
    fundingMode: "PLATFORM_FUNDED",
  });
  if (plat.json?.campaign?.lifecycle_state !== "requested") fail("R8_PLATFORM", JSON.stringify(plat.json).slice(0, 200));
  const { data: otherStore } = await sb.from("stores").select("id").neq("id", STORE.storeId).limit(1).maybeSingle();
  if (otherStore?.id) {
    const steal = await apiJson(ownerCookie, "POST", "/api/me/store-coupons/campaigns", {
      storeId: otherStore.id,
      title: "x",
      discountType: "fixed_amount",
      discountValue: 10,
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 86400000).toISOString(),
      fundingMode: "STORE_FUNDED",
    });
    if (steal.ok) fail("R8_OTHER_STORE", "owner must not write other store");
  }
  const appr = await apiJson(adminCookie, "PATCH", "/api/admin/store-coupons", { id: plat.json.campaign.id, action: "approve" });
  if (!appr.ok) fail("R8_ADMIN_APPROVE", JSON.stringify(appr.json).slice(0, 200));
  report.r.R8 = "PASS";

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

void main()
  .catch((e) => {
    if (!String(e?.message || e).startsWith("FAIL:")) {
      report.fail = { step: "CRASH", detail: String(e?.stack || e) };
      writeFileSync(OUT, JSON.stringify(report, null, 2));
      console.error(e);
      process.exitCode = 1;
    }
  })
  .finally(async () => {
    try {
      if (typeof globalThis.__restoreCouponMin === "function") await globalThis.__restoreCouponMin();
    } catch {
      /* ignore */
    }
    process.exit(process.exitCode || 0);
  });
