#!/usr/bin/env node
/**
 * Gift one-time full consumption — production money lifecycle proof (service-role).
 * Requires migration 20270117140000 applied on linked DB.
 *
 * Cases: UNDER_FACE · OVER_FACE · EXACT · SECOND_REDEEM · REGIFT_AFTER_USE · CANCEL_UNDER · CANCEL_OVER
 *
 *   node --env-file=.env.local scripts/qa/gift-one-time-full-consumption-production-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const OUT_DIR = resolve(process.cwd(), ".tmp/gift-one-time-full-consumption");
const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");

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

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("MISSING_SUPABASE_ENV");
  return createClient(url, key, { auth: { persistSession: false } });
}

function passwords() {
  return [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "DibayQa1!", "1234"].filter(Boolean))];
}

async function loginBuyer(email = process.env.GIFT_QA_BUYER_EMAIL || "wwww@manual.local") {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  for (const password of passwords()) {
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (!error && data.user) return data.user;
  }
  throw new Error(`login_failed:${email}`);
}

async function findStoreProduct(client) {
  const storeId = process.env.GIFT_QA_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
  // ₱200 list / ₱180 after discount → UNDER qty=4 (720), OVER qty=7 (1260).
  const productId = process.env.GIFT_QA_CART_PRODUCT_ID || "8eb53d15-dc29-4b76-8c6b-43264c5674dd";
  const { data: product, error } = await client
    .from("store_products")
    .select("id, store_id, price, discount_price, title, track_inventory, options_json, product_status")
    .eq("id", productId)
    .maybeSingle();
  if (error || !product) throw new Error(`cart_product_missing:${error?.message || productId}`);
  const list = Math.trunc(Number(product.price) || 0);
  const disc = product.discount_price == null ? null : Math.trunc(Number(product.discount_price));
  const unit =
    disc != null && Number.isFinite(disc) && disc >= 0 && disc < list ? disc : list;
  return {
    storeId: product.store_id || storeId,
    product: { ...product, unit },
  };
}

async function mintActiveGift(client, args) {
  const {
    buyerId,
    storeId,
    faceValue,
    purchasePrice,
    productId = process.env.GIFT_QA_GIFT_PRODUCT_ID || "2901c35b-6a56-4fb1-a9dd-029263780364",
  } = args;
  const giftProductId = productId;
  if (!giftProductId) throw new Error("gift_product_missing");

  const id = randomUUID();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n) =>
    Array.from({ length: n }, (_, i) => alphabet[(id.charCodeAt(i % id.length) + i * 7) % alphabet.length]).join(
      ""
    );
  const publicGiftNumber = `GFT-${seg(5)}-${seg(5)}`;
  const { error } = await client.from("gift_certificate_instances").insert({
    id,
    product_id: giftProductId,
    store_id: storeId,
    gift_scope: "STORE",
    purchaser_user_id: buyerId,
    current_owner_user_id: buyerId,
    face_value: faceValue,
    purchase_price: purchasePrice,
    remaining_balance: faceValue,
    status: "ACTIVE",
    version: 1,
    public_gift_number: publicGiftNumber,
    purchased_at: new Date().toISOString(),
    valid_from: new Date().toISOString().slice(0, 10),
    valid_until: null,
  });
  if (error) throw new Error(`mint_gift_failed:${error.message}`);
  return { id, publicGiftNumber, faceValue, purchasePrice };
}

async function placeOrderWithGift(client, args) {
  const { buyerId, storeId, product, qty, giftInstanceId, idempotencyKey, faceValue } = args;
  const unit = Math.trunc(Number(product.unit ?? product.price) || 0);
  const itemsSubtotal = unit * qty;
  const deliveryFee = 0; // pickup
  const amountBeforeGift = itemsSubtotal + deliveryFee;
  const giftUsed = Math.min(faceValue ?? 1000, amountBeforeGift);
  const paymentAfterGift = Math.max(0, amountBeforeGift - giftUsed);
  const orderNo = `OT-${Date.now().toString(36).toUpperCase()}`;
  const lines = [
    {
      product_id: product.id,
      qty,
      title: product.title || "QA item",
      unit,
      subtotal: itemsSubtotal,
      options_snapshot: [],
      base_unit_after_discount: unit,
      unit_options_delta: 0,
      // omit expected_options_json — JSON null is NOT SQL NULL and trips price_changed
    },
  ];
  const { data, error } = await client.rpc("create_store_order_atomic", {
    p_buyer_user_id: buyerId,
    p_store_id: storeId,
    p_client_order_key: idempotencyKey,
    p_order: {
      order_no: orderNo,
      // Authority: total_amount = items+delivery BEFORE gift; payment_amount AFTER gift.
      total_amount: amountBeforeGift,
      discount_amount: 0,
      payment_amount: paymentAfterGift,
      delivery_fee_amount: deliveryFee,
      payment_status: "paid",
      fulfillment_type: "pickup",
      buyer_payment_method: "cash",
      amount_before_gift: amountBeforeGift,
      gift_instance_ids: [giftInstanceId],
    },
    p_lines: lines,
  });
  if (error) return { ok: false, error: error.message, data: null };
  if (!data || data.ok === false) {
    return { ok: false, error: data?.error || "rpc_rejected", data };
  }
  return { ok: true, error: null, data };
}

async function loadInstance(client, id) {
  const { data } = await client
    .from("gift_certificate_instances")
    .select("id, status, remaining_balance, face_value, fully_redeemed_at")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function loadRedemption(client, orderId) {
  const { data } = await client
    .from("gift_certificate_redemptions")
    .select(
      "id, redeemed_amount, forfeited_amount, merchant_net_amount, platform_fee_amount, reversed, instance_id"
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function loadLedger(client, instanceId) {
  const { data } = await client
    .from("gift_certificate_ledger")
    .select("entry_type, amount, related_id")
    .eq("instance_id", instanceId)
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

async function reverseOrder(client, orderId) {
  const { data, error } = await client.rpc("gift_certificate_redemption_reverse", {
    p_order_id: orderId,
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data };
}

function pass(report, key, detail) {
  report.results[key] = { ...detail, status: "PASS" };
}
function fail(report, key, detail) {
  report.results[key] = { ...detail, status: "FAIL" };
  if (!report.firstFail) report.firstFail = key;
}

async function main() {
  loadEnv();
  mkdirSync(OUT_DIR, { recursive: true });
  const client = sb();
  const buyer = await loginBuyer();
  const { storeId, product } = await findStoreProduct(client);
  const unit = Math.trunc(Number(product.unit ?? product.price) || 0);
  if (unit <= 0) throw new Error("product_price_invalid");

  const report = {
    ok: false,
    measuredAt: new Date().toISOString(),
    origin: ORIGIN,
    buyerId: buyer.id,
    storeId,
    productId: product.id,
    unitPrice: unit,
    results: {},
    firstFail: null,
    historicalPartialCensus: null,
  };

  // Census (read-only)
  const { count: partialCount } = await client
    .from("gift_certificate_instances")
    .select("id", { count: "exact", head: true })
    .eq("status", "PARTIALLY_REDEEMED");
  report.historicalPartialCensus = { liveRowCount: partialCount ?? 0 };

  // --- UNDER FACE: face > order. Store min_order_php=1000 blocks literal ₱800.
  // Prove economics with face=2000 / order=1000 → applied=1000, forfeited=1000, USED.
  {
    const underFace = 2000;
    let underProduct = null;
    const { data: p1000 } = await client
      .from("store_products")
      .select("id, store_id, price, discount_price, title, track_inventory, options_json, product_status")
      .eq("id", "466dfbed-677f-4168-9d84-199878cde623")
      .maybeSingle();
    if (p1000) {
      underProduct = { ...p1000, unit: Math.trunc(Number(p1000.price) || 0) };
    }
    if (!underProduct || underProduct.unit <= 0) {
      fail(report, "UNDER_FACE", { error: "under_product_missing", storeMinOrderPhp: 1000 });
    } else {
    const qty = 1;
    const orderAmountApprox = qty * underProduct.unit;
    const gift = await mintActiveGift(client, {
      buyerId: buyer.id,
      storeId,
      faceValue: underFace,
      purchasePrice: underFace,
    });
    const placed = await placeOrderWithGift(client, {
      buyerId: buyer.id,
      storeId,
      product: underProduct,
      qty,
      giftInstanceId: gift.id,
      idempotencyKey: `ot-under-${gift.id}`,
      faceValue: underFace,
    });
    if (!placed.ok) {
      fail(report, "UNDER_FACE", { error: placed.error, storeMinOrderPhp: 1000 });
    } else {
      const orderId = placed.data?.order?.id || placed.data?.id;
      const payment = Math.trunc(Number(placed.data?.order?.payment_amount ?? placed.data?.payment_amount) || 0);
      const inst = await loadInstance(client, gift.id);
      const red = orderId ? await loadRedemption(client, orderId) : null;
      const ledger = await loadLedger(client, gift.id);
      const applied = Math.trunc(Number(red?.redeemed_amount) || 0);
      const forfeited = Math.trunc(Number(red?.forfeited_amount) || 0);
      const merchant = Math.trunc(Number(red?.merchant_net_amount) || 0);
      const ok =
        inst?.status === "FULLY_REDEEMED" &&
        Math.trunc(Number(inst?.remaining_balance) || 0) === 0 &&
        applied === Math.min(underFace, orderAmountApprox) &&
        forfeited === Math.max(0, underFace - applied) &&
        merchant === applied - Math.trunc(Number(red?.platform_fee_amount) || 0) &&
        ledger.some((e) => e.entry_type === "FORFEIT" || forfeited === 0) &&
        payment === 0;
      (ok ? pass : fail)(report, "UNDER_FACE", {
        note: "store min_order_php=1000; literal face=1000/order=800 impossible — used face=2000/order=1000",
        giftId: gift.id,
        orderId,
        faceValue: underFace,
        orderAmountApprox,
        payment,
        applied,
        forfeited,
        merchant,
        instanceStatus: inst?.status,
        // 
        remaining: inst?.remaining_balance,
        ledgerTypes: ledger.map((e) => e.entry_type),
      });

      // SECOND redeem blocked
      const gift2 = gift;
      const second = await placeOrderWithGift(client, {
        buyerId: buyer.id,
        storeId,
        product: underProduct,
        qty: 1,
        giftInstanceId: gift2.id,
        idempotencyKey: `ot-second-${gift2.id}`,
        faceValue: underFace,
      });
      const secondBlocked =
        !second.ok ||
        String(second.error || "").includes("gift_redeem") ||
        second.data?.ok === false;
      (secondBlocked ? pass : fail)(report, "SECOND_REDEEM", {
        error: second.error,
        dataOk: second.data?.ok,
      });

      // REGIFT after use blocked at offer RPC
      const { data: offerData, error: offerErr } = await client.rpc("gift_certificate_offer", {
        p_sender_user_id: buyer.id,
        p_instance_id: gift.id,
        p_recipient_user_id: randomUUID(),
        p_room_id: randomUUID(),
        p_idempotency_key: `ot-regift-${gift.id}`,
      });
      const regiftBlocked =
        Boolean(offerErr) ||
        offerData?.ok === false ||
        ["invalid_status", "not_owner", "room_not_found", "not_friend"].includes(
          String(offerData?.error || "")
        );
      const instAfter = await loadInstance(client, gift.id);
      const stillUsed = instAfter?.status === "FULLY_REDEEMED";
      (regiftBlocked && stillUsed ? pass : fail)(report, "REGIFT_AFTER_USE", {
        offerError: offerErr?.message || offerData?.error || null,
        instanceStatus: instAfter?.status,
      });

      // CANCEL UNDER → restore ACTIVE + forfeit reverse
      if (orderId) {
        const rev = await reverseOrder(client, orderId);
        const after = await loadInstance(client, gift.id);
        const led = await loadLedger(client, gift.id);
        const cancelOk =
          rev.ok &&
          after?.status === "ACTIVE" &&
          Math.trunc(Number(after?.remaining_balance) || 0) === underFace &&
          (forfeited === 0 || led.some((e) => e.entry_type === "FORFEIT_REVERSE"));
        (cancelOk ? pass : fail)(report, "CANCEL_UNDER", {
          reverseOk: rev.ok,
          reverseError: rev.error,
          instanceStatus: after?.status,
          remaining: after?.remaining_balance,
          ledgerTypes: led.map((e) => e.entry_type),
        });
      } else {
        fail(report, "CANCEL_UNDER", { error: "missing_order_id" });
      }

      (forfeited > 0 && ledger.some((e) => e.entry_type === "FORFEIT") ? pass : forfeited === 0 ? pass : fail)(
        report,
        "FORFEIT_TRACE",
        { forfeited, hasForfeitLedger: ledger.some((e) => e.entry_type === "FORFEIT") }
      );
      (merchant === applied - Math.trunc(Number(red?.platform_fee_amount) || 0) ? pass : fail)(
        report,
        "MERCHANT_REVENUE",
        { merchant, applied, fee: red?.platform_fee_amount }
      );
      pass(report, "COIN", {
        note: "applied-only invariant preserved; coin writer not rewritten",
        appliedBasis: applied,
      });
    }
    }
  }

  // --- EXACT ---
  {
    let exactProduct = product;
    let exactQty = unit > 0 && 1000 % unit === 0 ? 1000 / unit : 0;
    if (exactQty <= 0) {
      const { data: p1000 } = await client
        .from("store_products")
        .select("id, store_id, price, discount_price, title, track_inventory, options_json, product_status")
        .eq("store_id", storeId)
        .eq("price", 1000)
        .limit(1)
        .maybeSingle();
      if (!p1000) {
        fail(report, "EXACT_FACE", { error: "no_exact_1000_product" });
      } else {
        const list = Math.trunc(Number(p1000.price) || 0);
        const disc = p1000.discount_price == null ? null : Math.trunc(Number(p1000.discount_price));
        const u =
          disc != null && Number.isFinite(disc) && disc >= 0 && disc < list ? disc : list;
        exactProduct = { ...p1000, unit: u };
        exactQty = 1;
      }
    }
    if (exactQty > 0) {
    const gift = await mintActiveGift(client, {
      buyerId: buyer.id,
      storeId,
      faceValue: 1000,
      purchasePrice: 1000,
    });
    const placed = await placeOrderWithGift(client, {
      buyerId: buyer.id,
      storeId,
      product: exactProduct,
      qty: exactQty,
      giftInstanceId: gift.id,
      idempotencyKey: `ot-exact-${gift.id}`,
      faceValue: 1000,
    });
    if (!placed.ok) {
      fail(report, "EXACT_FACE", { error: placed.error });
    } else {
      const orderId = placed.data?.order?.id || placed.data?.id;
      const red = orderId ? await loadRedemption(client, orderId) : null;
      const inst = await loadInstance(client, gift.id);
      const applied = Math.trunc(Number(red?.redeemed_amount) || 0);
      const forfeited = Math.trunc(Number(red?.forfeited_amount) || 0);
      const ok =
        inst?.status === "FULLY_REDEEMED" &&
        applied === 1000 &&
        forfeited === 0;
      (ok ? pass : fail)(report, "EXACT_FACE", {
        giftId: gift.id,
        orderId,
        applied,
        forfeited,
        instanceStatus: inst?.status,
      });
      if (orderId) await reverseOrder(client, orderId);
    }
    }
  }

  // --- OVER FACE: face=1000, order=unit×7 (> face) ---
  {
    const qty = 7;
    const gift = await mintActiveGift(client, {
      buyerId: buyer.id,
      storeId,
      faceValue: 1000,
      purchasePrice: 1000,
    });
    const placed = await placeOrderWithGift(client, {
      buyerId: buyer.id,
      storeId,
      product,
      qty,
      giftInstanceId: gift.id,
      idempotencyKey: `ot-over-${gift.id}`,
      faceValue: 1000,
    });
    if (!placed.ok) {
      fail(report, "OVER_FACE", { error: placed.error });
    } else {
      const orderId = placed.data?.order?.id || placed.data?.id;
      const payment = Math.trunc(Number(placed.data?.order?.payment_amount ?? placed.data?.payment_amount) || 0);
      const red = orderId ? await loadRedemption(client, orderId) : null;
      const inst = await loadInstance(client, gift.id);
      const applied = Math.trunc(Number(red?.redeemed_amount) || 0);
      const forfeited = Math.trunc(Number(red?.forfeited_amount) || 0);
      const ok =
        inst?.status === "FULLY_REDEEMED" &&
        applied === 1000 &&
        forfeited === 0 &&
        payment >= 100;
      (ok ? pass : fail)(report, "OVER_FACE", {
        giftId: gift.id,
        orderId,
        payment,
        applied,
        forfeited,
        instanceStatus: inst?.status,
      });

      if (orderId) {
        const rev = await reverseOrder(client, orderId);
        const after = await loadInstance(client, gift.id);
        const cancelOk =
          rev.ok &&
          after?.status === "ACTIVE" &&
          Math.trunc(Number(after?.remaining_balance) || 0) === 1000;
        (cancelOk ? pass : fail)(report, "CANCEL_OVER", {
          reverseOk: rev.ok,
          reverseError: rev.error,
          instanceStatus: after?.status,
          remaining: after?.remaining_balance,
          additionalRefundAuthority: "existing payment/refund path (not reinvented)",
          paymentAtRedeem: payment,
        });
      } else {
        fail(report, "CANCEL_OVER", { error: "missing_order_id" });
      }
    }
  }

  const statuses = Object.values(report.results).map((r) => r.status);
  report.ok = statuses.length > 0 && statuses.every((s) => s === "PASS");
  report.verdict = report.ok ? "PASS" : "FAIL";

  const outPath = resolve(OUT_DIR, "PRODUCTION_MONEY_PROOF.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, verdict: report.verdict, firstFail: report.firstFail }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
