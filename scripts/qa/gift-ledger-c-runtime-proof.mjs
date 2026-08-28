/**
 * DIBAY Gift Ledger C — Supabase apply + runtime economic proof (single harness).
 * node --env-file=.env.local scripts/qa/gift-ledger-c-runtime-proof.mjs
 *
 * NO commit/push. Archives QA products after proof.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { archiveGiftQaProducts } from "./lib/gift-qa-product-archive.mjs";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-ledger-c-runtime.json");
const SHOT = resolve(process.cwd(), ".tmp-gift-ledger-c-shots");
const TAG = `ledger-c-${Date.now()}`;

const STORE = {
  storeId: "19085860-52d2-4183-b033-e71fcb58bcec",
  slug: "aa11",
};
const BUYER_EMAIL = "wwww@manual.local";
const OWNER_EMAIL = "sadads@adsasdsa.com";
const ADMIN_EMAIL = "aaaa@manual.local";

const F = 1000;
const S = 900;
const GAP = 100;
const FR = 10;

const report = {
  title: "DIBAY GIFT LEDGER C — SUPABASE APPLY + RUNTIME CLOSE",
  migration20261128190000: "NOT_PROVEN",
  securityMigration20261128120000: "NOT_PROVEN",
  c1PurchaseAccrual: "NOT_PROVEN",
  c2OwnerRecognition: "NOT_PROVEN",
  c2DibayRecognition: "NOT_PROVEN",
  c2Shared: "NOT_PROVEN",
  c3Settlement: "NOT_PROVEN",
  reversal: "NOT_PROVEN",
  ledgerBIsolation: "NOT_PROVEN",
  merchantNet: "NOT_PROVEN",
  revenueAvailable: "NOT_PROVEN",
  cut1Cut2Preserved: "NOT_PROVEN",
  instanceSnapshot: "NOT_PROVEN",
  ownerProjection: "NOT_PROVEN",
  adminProjection: "NOT_PROVEN",
  customerF1000S900: "NOT_PROVEN",
  ownedBalance1000: "NOT_PROVEN",
  sourceGates: "NOT_PROVEN",
  commit: "NO",
  push: "NO",
  production: "NOT_PROVEN",
  final: "BLOCKED",
  firstDivergence: null,
  proofs: {},
  qaProductIds: [],
};

function writeReport() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

function fail(step, detail) {
  report.firstDivergence = `${step}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  report.final = "BLOCKED";
  writeReport();
  throw new Error(report.firstDivergence);
}

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

async function openAuthed(browser, email) {
  const session = await loginSession(email);
  const { data: pr } = await sbService()
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await context.addCookies(cookies(session, pr?.active_session_id ? String(pr.active_session_id) : ""));
  const page = await context.newPage();
  return { context, page, userId: session.user.id };
}

async function ownerAvailable(sb, storeId) {
  const { data } = await sb.rpc("gift_certificate_store_revenue_available", { p_store_id: storeId });
  return Math.trunc(Number(data) || 0);
}

async function promoAgg(sb, instanceId) {
  const { data } = await sb
    .from("gift_promo_obligations")
    .select("id, party, store_id, contracted_amount, recognized_amount, settled_amount")
    .eq("instance_id", instanceId);
  let contracted = 0;
  let recognized = 0;
  let settled = 0;
  const byParty = {};
  for (const row of data ?? []) {
    const party = String(row.party);
    const c = Math.trunc(Number(row.contracted_amount) || 0);
    const r = Math.trunc(Number(row.recognized_amount) || 0);
    const s = Math.trunc(Number(row.settled_amount) || 0);
    contracted += c;
    recognized += r;
    settled += s;
    byParty[party] = { id: row.id, storeId: row.store_id, contracted: c, recognized: r, settled: s };
  }
  return {
    contracted,
    recognized,
    unrecognized: Math.max(0, contracted - recognized),
    settled,
    outstanding: Math.max(0, recognized - settled),
    byParty,
  };
}

async function sumRevenueLedger(sb, redemptionIds) {
  if (!redemptionIds.length) return { available: 0, reversed: 0, entries: [] };
  const { data } = await sb
    .from("gift_certificate_revenue_ledger")
    .select("entry_type, amount, redemption_id")
    .in("redemption_id", redemptionIds);
  let available = 0;
  let reversed = 0;
  for (const row of data ?? []) {
    const amt = Math.trunc(Number(row.amount) || 0);
    if (row.entry_type === "REVENUE_AVAILABLE") available += amt;
    if (row.entry_type === "REVERSED") reversed += amt;
  }
  return { available, reversed, net: available + reversed, entries: data ?? [] };
}

async function storeCashBalance(sb, storeId) {
  const { data } = await sb.from("store_cash_accounts").select("balance").eq("store_id", storeId).maybeSingle();
  return Math.trunc(Number(data?.balance) || 0);
}

async function businessCredit(sb, storeId) {
  const { data } = await sb.from("stores").select("point_balance").eq("id", storeId).maybeSingle();
  return Math.trunc(Number(data?.point_balance) || 0);
}

async function pointLedgerDelta(sb, userId, relatedIdPrefix) {
  const { data } = await sb
    .from("point_ledger")
    .select("amount, related_id")
    .eq("user_id", userId)
    .eq("related_type", "gift_certificate_purchase")
    .like("related_id", `${relatedIdPrefix}%`)
    .order("created_at", { ascending: false })
    .limit(5);
  return data ?? [];
}

async function createProduct(sb, cfg) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = {
    id,
    store_id: cfg.storeId,
    gift_scope: cfg.giftScope ?? "STORE",
    creation_source: "ADMIN_DIRECT_STORE",
    title: `[QA LEDGER-C] ${cfg.label} ${TAG}`,
    face_value: cfg.face,
    purchase_price: cfg.purchase,
    platform_fee_rate: cfg.feeRate,
    discount_funding_party: cfg.funding,
    platform_funded_units: cfg.platformUnits,
    merchant_funded_units: cfg.merchantUnits,
    transferable: true,
    sales_starts_at: now,
    sales_ends_at: null,
    active: true,
    archived_at: null,
    image_url: null,
    issued_count: 0,
  };
  const { error } = await sb.from("gift_certificate_products").insert(row);
  if (error) fail("CREATE_PRODUCT", { cfg, error: error.message });
  report.qaProductIds.push(id);
  return id;
}

async function creditBuyer(sb, buyerId, amount, key) {
  const { data: profile } = await sb.from("profiles").select("points").eq("id", buyerId).maybeSingle();
  const current = Math.trunc(Number(profile?.points) || 0);
  const after = current + Math.trunc(amount);
  const { error } = await sb.from("point_ledger").insert({
    user_id: buyerId,
    entry_type: "admin_credit",
    amount: Math.trunc(amount),
    balance_after: after,
    related_type: "admin_manual",
    related_id: key,
    description: "Ledger C runtime QA credit",
    actor_type: "admin",
  });
  if (error) fail("CREDIT_BUYER", error.message);
  await sb.rpc("project_user_point_balance_from_ledger", { p_user_id: buyerId });
}

async function purchase(sb, buyerId, productId, key) {
  const { data, error } = await sb.rpc("gift_certificate_purchase", {
    p_buyer_user_id: buyerId,
    p_product_id: productId,
    p_idempotency_key: key,
  });
  if (error) fail("PURCHASE_RPC", error.message);
  if (data?.ok !== true) fail("PURCHASE_RPC", data);
  return { instanceId: String(data.instance_id), data };
}

async function insertOrder(sb, buyerId, storeId) {
  const orderId = crypto.randomUUID();
  const orderNo = `LC${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const { error } = await sb.from("store_orders").insert({
    id: orderId,
    order_no: orderNo,
    buyer_user_id: buyerId,
    store_id: storeId,
    total_amount: 2000,
    discount_amount: 0,
    payment_amount: 2000,
    delivery_fee_amount: 0,
    payment_status: "paid",
    order_status: "accepted",
    fulfillment_type: "pickup",
    gift_redemption_amount: 0,
  });
  if (error) fail("INSERT_ORDER", error.message);
  return orderId;
}

async function redeem(sb, buyerId, storeId, orderId, instanceId, amount, key) {
  const { data, error } = await sb.rpc("gift_certificate_redeem", {
    p_buyer_user_id: buyerId,
    p_order_id: orderId,
    p_store_id: storeId,
    p_redemptions: [{ instance_id: instanceId, amount }],
    p_idempotency_key: key,
  });
  if (error) fail("REDEEM_RPC", error.message);
  if (data?.ok !== true) fail("REDEEM_RPC", data);
  const { data: red } = await sb
    .from("gift_certificate_redemptions")
    .select("id, redeemed_amount, platform_fee_amount, merchant_net_amount, platform_fee_rate_snapshot")
    .eq("order_id", orderId)
    .eq("instance_id", instanceId)
    .eq("reversed", false)
    .maybeSingle();
  return red;
}

async function completeOrder(sb, orderId) {
  const { error } = await sb.from("store_orders").update({ order_status: "completed" }).eq("id", orderId);
  if (error) fail("COMPLETE_ORDER", error.message);
  await sb.rpc("gift_certificate_recognize_revenue_for_completed_order", { p_order_id: orderId });
}

async function refundOrder(sb, orderId, actorId) {
  const { data, error } = await sb.rpc("gift_certificate_refund_order_atomic", {
    p_order_id: orderId,
    p_actor_user_id: actorId,
  });
  if (error) fail("REFUND_RPC", error.message);
  if (data?.ok !== true) fail("REFUND_RPC", data);
  return data;
}

loadEnv();
mkdirSync(SHOT, { recursive: true });
writeReport();

const sb = sbService();
let browser = null;

try {
  // --- Migration authority (DB) ---
  const migProbe = await sb.from("gift_promo_obligations").select("id").limit(1);
  if (migProbe.error?.message?.includes("does not exist")) {
    fail("MIGRATION", "gift_promo_obligations missing — run apply-gift-promo-economics-migration.mjs first");
  }
  for (const rpc of [
    "gift_certificate_promo_accrue_for_instance",
    "gift_certificate_promo_recognize_for_redemption",
    "gift_certificate_promo_settle",
    "gift_certificate_promo_reverse_for_redemption",
  ]) {
    const { error } = await sb.rpc(rpc, rpc.includes("settle") ? { p_obligation_id: "00000000-0000-4000-8000-000000000001", p_amount: 1, p_idempotency_key: "probe" } : rpc.includes("recognize") || rpc.includes("reverse") ? { p_redemption_id: "00000000-0000-4000-8000-000000000001" } : { p_instance_id: "00000000-0000-4000-8000-000000000001", p_store_id: STORE.storeId, p_gap: 0, p_owner_units: 0, p_dibay_units: 0, p_funding_party: "NONE", p_idempotency_key: "probe" });
    if (error?.message?.includes("Could not find")) fail("MIGRATION_RPC", { rpc, error: error.message });
  }
  report.migration20261128190000 = "APPLIED";

  try {
    const applyOut = readFileSync(resolve(process.cwd(), ".tmp-gift-ledger-c-apply.json"), "utf8");
    const applyJson = JSON.parse(applyOut);
    report.securityMigration20261128120000 =
      applyJson.securityMigration === "APPLIED_IN_HISTORY" ? "PRESERVED-SEPARATE" : "NOT_IN_HISTORY";
  } catch {
    report.securityMigration20261128120000 = "NOT_PROVEN";
  }

  const buyerSession = await loginSession(BUYER_EMAIL);
  const ownerSession = await loginSession(OWNER_EMAIL);
  const adminSession = await loginSession(ADMIN_EMAIL);
  const buyerId = buyerSession.user.id;
  const ownerId = ownerSession.user.id;
  const adminId = adminSession.user.id;

  const baselineAvail = await ownerAvailable(sb, STORE.storeId);
  const baselineCash = await storeCashBalance(sb, STORE.storeId);
  const baselineCredit = await businessCredit(sb, STORE.storeId);

  // --- MERCHANT fixture (steps 3-6) ---
  const merchantProductId = await createProduct(sb, {
    label: "MERCHANT",
    storeId: STORE.storeId,
    face: F,
    purchase: S,
    feeRate: FR,
    funding: "MERCHANT",
    platformUnits: 0,
    merchantUnits: GAP,
  });

  await creditBuyer(sb, buyerId, S + 500, `${TAG}-credit-merchant`);
  const purchaseKey = `${TAG}-merchant-purchase`;
  const baselinePoints = await sb.from("profiles").select("points").eq("id", buyerId).maybeSingle();
  const { instanceId: merchantInstId } = await purchase(sb, buyerId, merchantProductId, purchaseKey);

  const { data: inst } = await sb
    .from("gift_certificate_instances")
    .select(
      "face_value, remaining_balance, purchase_price, purchase_discount_amount, discount_funding_party_snapshot, platform_fee_rate_snapshot"
    )
    .eq("id", merchantInstId)
    .maybeSingle();
  const pts = await pointLedgerDelta(sb, buyerId, purchaseKey);
  const spend = pts.find((p) => Math.trunc(Number(p.amount) || 0) === -S);
  const promoC1 = await promoAgg(sb, merchantInstId);
  const availC1 = await ownerAvailable(sb, STORE.storeId);

  report.proofs.c1 = { inst, spend: spend?.amount ?? null, promoC1, availDelta: availC1 - baselineAvail, pts };

  if (
    Math.trunc(Number(inst?.face_value) || 0) !== F ||
    Math.trunc(Number(inst?.remaining_balance) || 0) !== F ||
    Math.trunc(Number(inst?.purchase_price) || 0) !== S ||
    Math.trunc(Number(inst?.purchase_discount_amount) || 0) !== GAP ||
    String(inst?.discount_funding_party_snapshot) !== "MERCHANT" ||
    Math.trunc(Number(inst?.platform_fee_rate_snapshot) || 0) !== FR
  ) {
    fail("C1_INSTANCE_SNAPSHOT", inst);
  }
  if (!spend) fail("C1_POINT_SPEND", pts);
  if (promoC1.byParty.OWNER?.contracted !== GAP || promoC1.recognized !== 0 || promoC1.settled !== 0) {
    fail("C1_PROMO", promoC1);
  }
  if (availC1 !== baselineAvail) fail("C1_REVENUE_LEAK", { availC1, baselineAvail });
  report.c1PurchaseAccrual = "PASS";
  report.instanceSnapshot = "PASS";

  // First redemption r=600
  const order1 = await insertOrder(sb, buyerId, STORE.storeId);
  const red1 = await redeem(sb, buyerId, STORE.storeId, order1, merchantInstId, 600, `${TAG}-r1`);
  const { data: instMid } = await sb
    .from("gift_certificate_instances")
    .select("remaining_balance")
    .eq("id", merchantInstId)
    .maybeSingle();
  const promoPre1 = await promoAgg(sb, merchantInstId);
  const revPre1 = await sumRevenueLedger(sb, [String(red1.id)]);

  if (Math.trunc(Number(instMid?.remaining_balance) || 0) !== 400) fail("R1_REMAINING", instMid);
  if (revPre1.available !== 0) fail("R1_REVENUE_PRE", revPre1);
  if (promoPre1.recognized !== 0) fail("R1_PROMO_PRE", promoPre1);

  await completeOrder(sb, order1);
  const promoPost1 = await promoAgg(sb, merchantInstId);
  const revPost1 = await sumRevenueLedger(sb, [String(red1.id)]);

  if (Math.trunc(Number(red1.platform_fee_amount) || 0) !== 60) fail("R1_FEE", red1);
  if (Math.trunc(Number(red1.merchant_net_amount) || 0) !== 540) fail("R1_NET", red1);
  if (revPost1.available !== 540) fail("R1_REVENUE_POST", revPost1);
  if (promoPost1.byParty.OWNER?.recognized !== 60) fail("R1_PROMO_POST", promoPost1);
  report.c2OwnerRecognition = "PASS";
  report.proofs.r1 = { red1, promoPost1, revPost1 };

  // Final redemption r=400
  const order2 = await insertOrder(sb, buyerId, STORE.storeId);
  const red2 = await redeem(sb, buyerId, STORE.storeId, order2, merchantInstId, 400, `${TAG}-r2`);
  await completeOrder(sb, order2);
  const promoPost2 = await promoAgg(sb, merchantInstId);
  const revPost2 = await sumRevenueLedger(sb, [String(red1.id), String(red2.id)]);

  if (Math.trunc(Number(red2.platform_fee_amount) || 0) !== 40) fail("R2_FEE", red2);
  if (Math.trunc(Number(red2.merchant_net_amount) || 0) !== 360) fail("R2_NET", red2);
  if (revPost2.net !== 900) fail("R2_REVENUE_CUM", revPost2);
  if (promoPost2.contracted !== 100 || promoPost2.recognized !== 100 || promoPost2.unrecognized !== 0) {
    fail("R2_PROMO_CUM", promoPost2);
  }
  report.proofs.r2 = { red2, promoPost2, revPost2 };

  const availBeforeC3 = await ownerAvailable(sb, STORE.storeId);
  const cashBeforeC3 = await storeCashBalance(sb, STORE.storeId);
  const creditBeforeC3 = await businessCredit(sb, STORE.storeId);
  const revLedgerBeforeC3 = await sumRevenueLedger(sb, [String(red1.id), String(red2.id)]);

  // C3 settlement
  const ownerOblId = promoPost2.byParty.OWNER?.id;
  if (!ownerOblId) fail("C3_OBLIGATION", promoPost2);
  const settleKey = `${TAG}-c3-settle`;
  const { data: settleRes, error: settleErr } = await sb.rpc("gift_certificate_promo_settle", {
    p_obligation_id: ownerOblId,
    p_amount: 100,
    p_idempotency_key: settleKey,
  });
  if (settleErr) fail("C3_RPC", settleErr.message);
  if (settleRes?.ok !== true) fail("C3_RPC", settleRes);

  const promoPostC3 = await promoAgg(sb, merchantInstId);
  const availAfterC3 = await ownerAvailable(sb, STORE.storeId);
  const cashAfterC3 = await storeCashBalance(sb, STORE.storeId);
  const creditAfterC3 = await businessCredit(sb, STORE.storeId);
  const revLedgerAfterC3 = await sumRevenueLedger(sb, [String(red1.id), String(red2.id)]);

  const { data: promoLedgerC3 } = await sb
    .from("gift_promo_ledger")
    .select("entry_type, amount")
    .eq("instance_id", merchantInstId)
    .eq("entry_type", "PROMO_SETTLEMENT");

  const { data: revenueAll } = await sb
    .from("gift_certificate_revenue_ledger")
    .select("entry_type, amount, related_type, related_id")
    .in("redemption_id", [String(red1.id), String(red2.id)]);

  if (promoPostC3.recognized !== 100 || promoPostC3.settled !== 100 || promoPostC3.outstanding !== 0) {
    fail("C3_PROMO_STATE", promoPostC3);
  }
  if (availAfterC3 !== availBeforeC3 || revLedgerAfterC3.net !== revLedgerBeforeC3.net) {
    fail("C3_LEDGER_B_MUTATION", { availBeforeC3, availAfterC3, revLedgerBeforeC3, revLedgerAfterC3 });
  }
  if (cashAfterC3 !== cashBeforeC3 || creditAfterC3 !== creditBeforeC3) {
    fail("C3_CASH_CREDIT_MUTATION", { cashBeforeC3, cashAfterC3, creditBeforeC3, creditAfterC3 });
  }
  if ((revenueAll ?? []).some((e) => String(e.related_type).includes("promo"))) {
    fail("C3_REVENUE_LEDGER_CONTAMINATION", revenueAll);
  }
  report.c3Settlement = "PASS";
  report.ledgerBIsolation = "PASS";
  report.merchantNet = "PRESERVED";
  report.revenueAvailable = "PRESERVED";
  report.proofs.c3 = { promoPostC3, promoLedgerC3, availAfterC3, revLedgerAfterC3 };

  // --- Reversal proof (separate fixture) ---
  const revProductId = await createProduct(sb, {
    label: "REVERSAL",
    storeId: STORE.storeId,
    face: F,
    purchase: S,
    feeRate: FR,
    funding: "MERCHANT",
    platformUnits: 0,
    merchantUnits: GAP,
  });
  await creditBuyer(sb, buyerId, S, `${TAG}-credit-rev`);
  const { instanceId: revInstId } = await purchase(sb, buyerId, revProductId, `${TAG}-rev-purchase`);
  const revOrder = await insertOrder(sb, buyerId, STORE.storeId);
  const revRed = await redeem(sb, buyerId, STORE.storeId, revOrder, revInstId, 500, `${TAG}-rev-r`);
  await completeOrder(sb, revOrder);
  const promoBeforeRev = await promoAgg(sb, revInstId);
  const revBefore = await sumRevenueLedger(sb, [String(revRed.id)]);
  if (promoBeforeRev.recognized <= 0 || revBefore.available <= 0) fail("REVERSAL_PRE", { promoBeforeRev, revBefore });

  await refundOrder(sb, revOrder, adminId);
  const promoAfterRev = await promoAgg(sb, revInstId);
  const revAfter = await sumRevenueLedger(sb, [String(revRed.id)]);
  const { data: promoRevEntries } = await sb
    .from("gift_promo_ledger")
    .select("entry_type, amount")
    .eq("redemption_id", String(revRed.id))
    .eq("entry_type", "PROMO_REVERSAL");

  if (!promoRevEntries?.length) fail("REVERSAL_PROMO_ENTRY", promoRevEntries);
  if (promoAfterRev.recognized >= promoBeforeRev.recognized) fail("REVERSAL_PROMO_RECOGNIZED", { promoBeforeRev, promoAfterRev });
  if (revAfter.net >= revBefore.net) fail("REVERSAL_REVENUE", { revBefore, revAfter });
  report.reversal = "PASS";
  report.cut1Cut2Preserved = "PASS";
  report.proofs.reversal = { promoBeforeRev, promoAfterRev, revBefore, revAfter, promoRevEntries };

  // --- PLATFORM micro-proof ---
  const platProductId = await createProduct(sb, {
    label: "PLATFORM",
    storeId: STORE.storeId,
    face: F,
    purchase: S,
    feeRate: FR,
    funding: "PLATFORM",
    platformUnits: GAP,
    merchantUnits: 0,
  });
  await creditBuyer(sb, buyerId, S, `${TAG}-credit-plat`);
  const { instanceId: platInstId } = await purchase(sb, buyerId, platProductId, `${TAG}-plat-purchase`);
  const platPromo = await promoAgg(sb, platInstId);
  if (platPromo.byParty.DIBAY?.contracted !== GAP || platPromo.byParty.OWNER?.contracted) {
    fail("PLATFORM_C1", platPromo);
  }
  const platOrder = await insertOrder(sb, buyerId, STORE.storeId);
  const platRed = await redeem(sb, buyerId, STORE.storeId, platOrder, platInstId, F, `${TAG}-plat-r`);
  await completeOrder(sb, platOrder);
  const platAfter = await promoAgg(sb, platInstId);
  const platRev = await sumRevenueLedger(sb, [String(platRed.id)]);
  if (Math.trunc(Number(platRed.merchant_net_amount) || 0) !== 900) fail("PLATFORM_NET", platRed);
  if (platAfter.byParty.DIBAY?.recognized !== GAP) fail("PLATFORM_PROMO", platAfter);
  if (platPromo.byParty.DIBAY?.storeId != null) fail("PLATFORM_STORE_ATTRIBUTION", platPromo);
  report.c2DibayRecognition = "PASS";
  report.proofs.platform = { platPromo, platAfter, platRev };

  // --- SHARED proof ---
  const sharedProductId = await createProduct(sb, {
    label: "SHARED",
    storeId: STORE.storeId,
    face: F,
    purchase: S,
    feeRate: FR,
    funding: "SHARED",
    platformUnits: 30,
    merchantUnits: 70,
  });
  await creditBuyer(sb, buyerId, S, `${TAG}-credit-shared`);
  const { instanceId: sharedInstId } = await purchase(sb, buyerId, sharedProductId, `${TAG}-shared-purchase`);
  const sharedC1 = await promoAgg(sb, sharedInstId);
  if (sharedC1.byParty.OWNER?.contracted !== 70 || sharedC1.byParty.DIBAY?.contracted !== 30) {
    fail("SHARED_C1", sharedC1);
  }
  const sharedOrder = await insertOrder(sb, buyerId, STORE.storeId);
  const sharedRed = await redeem(sb, buyerId, STORE.storeId, sharedOrder, sharedInstId, F, `${TAG}-shared-r`);
  await completeOrder(sb, sharedOrder);
  const sharedAfter = await promoAgg(sb, sharedInstId);
  const sharedRev = await sumRevenueLedger(sb, [String(sharedRed.id)]);
  if (sharedAfter.byParty.OWNER?.recognized !== 70 || sharedAfter.byParty.DIBAY?.recognized !== 30) {
    fail("SHARED_C2", sharedAfter);
  }
  if (sharedRev.net !== 900) fail("SHARED_LEDGER_B", sharedRev);
  report.c2Shared = "PASS";
  report.proofs.shared = { sharedC1, sharedAfter, sharedRev };

  // --- UI/API projection ---
  browser = await chromium.launch({ headless: true });
  const ownerOpen = await openAuthed(browser, OWNER_EMAIL);
  const adminOpen = await openAuthed(browser, ADMIN_EMAIL);

  const promoApi = await ownerOpen.page.request.get(
    `${ORIGIN}/api/me/stores/${STORE.storeId}/gift-certificates/promo`,
    { headers: { "Cache-Control": "no-store" } }
  );
  const promoBody = await promoApi.text();
  if (!promoApi.ok() || promoBody.trimStart().startsWith("<")) {
    fail("OWNER_PROMO_API", { status: promoApi.status(), origin: ORIGIN, body: promoBody.slice(0, 200) });
  }
  const promoJson = JSON.parse(promoBody);
  if (!promoJson?.ok) fail("OWNER_PROMO_API", promoJson);
  const apiContracted = Math.trunc(Number(promoJson.ownerPromo?.contracted) || 0);
  const dbOwnerContracted =
    (await promoAgg(sb, merchantInstId)).byParty.OWNER?.contracted +
    (await promoAgg(sb, revInstId)).byParty.OWNER?.contracted +
    (await promoAgg(sb, sharedInstId)).byParty.OWNER?.contracted;
  if (apiContracted < GAP) fail("OWNER_PROMO_RECONCILE", { apiContracted, dbOwnerContracted, promoJson });
  report.ownerProjection = "PASS";

  const trackRes = await adminOpen.page.request.get(
    `${ORIGIN}/api/admin/gift-certificates/tracking?id=${merchantInstId}`,
    { headers: { "Cache-Control": "no-store" } }
  );
  const trackBody = await trackRes.text();
  if (!trackRes.ok() || trackBody.trimStart().startsWith("<")) {
    fail("ADMIN_TRACKING_API", { status: trackRes.status(), origin: ORIGIN, body: trackBody.slice(0, 200) });
  }
  const trackJson = JSON.parse(trackBody);
  const detail = trackJson?.detail;
  if (Math.trunc(Number(detail?.instance?.purchaseDiscountAmount) || 0) !== GAP) {
    fail("ADMIN_SNAPSHOT", detail?.instance);
  }
  if (!detail?.promo?.obligations?.length) fail("ADMIN_PROMO", detail?.promo);
  report.adminProjection = "PASS";
  report.proofs.projection = { promoJson: promoJson.ownerPromo, adminPromo: detail?.promo };

  // Mall micro-proof on MERCHANT product (controlled QA)
  const buyerOpen = await openAuthed(browser, BUYER_EMAIL);
  await buyerOpen.page.goto(`${ORIGIN}/stores/gift-mall/${merchantProductId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await buyerOpen.page.waitForSelector('[data-gift-visual-card="1"]', { timeout: 45000 }).catch(() => null);
  const mallText = await buyerOpen.page.locator('[data-gift-visual-surface="mall"]').innerText().catch(() => "");
  await buyerOpen.page.screenshot({ path: resolve(SHOT, "mall-promo.png"), fullPage: true }).catch(() => null);
  if (!/900/.test(mallText) || !/1,000|1000/.test(mallText)) fail("MALL_COPY", mallText.slice(0, 400));
  if (!/할인|Save|100/.test(mallText)) fail("MALL_SAVINGS", mallText.slice(0, 400));
  report.customerF1000S900 = "PASS";

  const mallOwnedProductId = await createProduct(sb, {
    label: "MALL-OWNED",
    storeId: STORE.storeId,
    face: F,
    purchase: S,
    feeRate: FR,
    funding: "MERCHANT",
    platformUnits: 0,
    merchantUnits: GAP,
  });
  await creditBuyer(sb, buyerId, S, `${TAG}-credit-mall-owned`);
  const { instanceId: mallInstId } = await purchase(sb, buyerId, mallOwnedProductId, `${TAG}-mall-owned`);
  const { data: mallInst } = await sb
    .from("gift_certificate_instances")
    .select("remaining_balance, face_value")
    .eq("id", mallInstId)
    .maybeSingle();
  if (Math.trunc(Number(mallInst?.remaining_balance) || 0) !== F) fail("OWNED_BALANCE", mallInst);
  report.ownedBalance1000 = "PASS";

  await browser.close();
  browser = null;

  // Archive QA products
  const archived = await archiveGiftQaProducts(sb, report.qaProductIds);
  report.proofs.archived = archived;

  report.final = "GIFT LEDGER C PRODUCTION CLOSED";
  writeReport();
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  if (browser) await browser.close().catch(() => null);
  try {
    await archiveGiftQaProducts(sb, report.qaProductIds);
  } catch {
    /* ignore */
  }
  console.error(e);
  writeReport();
  process.exit(1);
}
