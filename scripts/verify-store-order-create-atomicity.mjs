#!/usr/bin/env node
/**
 * Phase 5 + Stores A — POST create must use createStoreOrderAtomic;
 * coupon redemption must be inside RPC TX (no post-commit soft-log).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = fs.readFileSync(path.join(root, "app/api/me/store-orders/route.ts"), "utf8");
const mig = fs.readFileSync(
  path.join(root, "supabase/migrations/20261022120000_create_store_order_atomic.sql"),
  "utf8"
);
const migCoupon = fs.readFileSync(
  path.join(root, "supabase/migrations/20261024170000_create_store_order_atomic_coupon_redemption.sql"),
  "utf8"
);
const migMoney = fs.readFileSync(
  path.join(root, "supabase/migrations/20261216120000_create_store_order_atomic_money_authority.sql"),
  "utf8"
);

const fails = [];
if (!route.includes("createStoreOrderAtomic")) {
  fails.push("route missing createStoreOrderAtomic");
}
if (route.includes("restoreDecrementedStock") || route.includes("stockRollback")) {
  fails.push("route still has app-layer stock compensate");
}
if (route.includes("recordStoreCouponRedemption")) {
  fails.push("route still posts redemption outside atomic RPC");
}
if (!route.includes("coupon_campaign_id")) {
  fails.push("route missing coupon_campaign_id on atomic order payload");
}
if (!mig.includes("CREATE OR REPLACE FUNCTION public.create_store_order_atomic")) {
  fails.push("migration missing create_store_order_atomic");
}
if (!mig.includes("FOR UPDATE")) {
  fails.push("migration missing FOR UPDATE locks");
}
if (!mig.includes("pg_advisory_xact_lock")) {
  fails.push("migration missing advisory lock for client_order_key");
}
if (!mig.includes("WHEN unique_violation THEN")) {
  fails.push("migration missing unique_violation rollback path");
}
if (!mig.includes("insufficient_stock")) {
  fails.push("migration missing stock CAS failure");
}
if (!mig.includes("price_changed")) {
  fails.push("migration missing price_changed revalidation");
}
if (!mig.includes("store_closed") || !mig.includes("product_sold_out")) {
  fails.push("migration missing closed/sold-out revalidation");
}
if (!migCoupon.includes("store_coupon_redemptions")) {
  fails.push("coupon migration missing store_coupon_redemptions insert");
}
if (!migCoupon.includes("coupon_campaign_id")) {
  fails.push("coupon migration missing coupon_campaign_id on order insert");
}
if (!migCoupon.includes("coupon_already_redeemed")) {
  fails.push("coupon migration missing coupon_already_redeemed");
}
if (!route.includes("notifyStoreOwnerNewOrder")) {
  fails.push("route missing post-commit owner notify");
}

/** CUT-2 ROOT A — money authority inside create TX */
if (!migMoney.includes("store_charged_delivery_fee_php")) {
  fails.push("money migration missing store_charged_delivery_fee_php");
}
if (!migMoney.includes("v_items_subtotal")) {
  fails.push("money migration missing v_items_subtotal recompute");
}
if (!migMoney.includes("v_delivery_fee_auth")) {
  fails.push("money migration missing v_delivery_fee_auth");
}
if (!migMoney.includes("business_hours_json")) {
  fails.push("money migration missing store business_hours_json lock");
}
if (!/round\(v_delivery_fee_auth\)/.test(migMoney)) {
  fails.push("money migration must INSERT authoritative delivery_fee_auth");
}
if (!/round\(v_auth_total\)/.test(migMoney)) {
  fails.push("money migration must INSERT authoritative total");
}
{
  const insertIdx = migMoney.indexOf("INSERT INTO public.store_orders");
  const insertChunk = insertIdx >= 0 ? migMoney.slice(insertIdx, insertIdx + 2500) : "";
  if (!insertChunk) {
    fails.push("money migration missing store_orders INSERT");
  } else if (insertChunk.includes("p_order->>'delivery_fee_amount'")) {
    fails.push("money migration must not INSERT payload delivery_fee_amount");
  } else if (insertChunk.includes("p_order->>'total_amount'")) {
    fails.push("money migration must not INSERT payload total_amount");
  }
}
if (/v_payment_amount := coalesce\(\(p_order->>'payment_amount'\)::numeric, 0\)/.test(migMoney)) {
  fails.push("money migration must not trust payload payment_amount as authority");
}
if (/gift_certificate_instance_redeem_fee_rate\s*\(/.test(migMoney)) {
  fails.push("money migration must not depend on unapplied gift_certificate_instance_redeem_fee_rate");
}
if (!migMoney.includes("FROM public.gift_certificate_products")) {
  fails.push("money migration missing live-compat gift fee from gift_certificate_products");
}

const migMinCoupon = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20261217120000_create_store_order_atomic_min_order_coupon_authority.sql"
  ),
  "utf8"
);
if (!migMinCoupon.includes("below_min_order")) {
  fails.push("min/coupon migration missing below_min_order");
}
if (!migMinCoupon.includes("v_discount_auth")) {
  fails.push("min/coupon migration missing v_discount_auth");
}
if (migMinCoupon.includes("v_discount := round(coalesce((p_order->>'discount_amount')::numeric, 0))")) {
  fails.push("min/coupon migration still trusts payload discount_amount");
}
if (!migMinCoupon.includes("v_discount := round(v_discount_auth)")) {
  fails.push("min/coupon migration missing authoritative discount assignment");
}
if (/gift_certificate_instance_redeem_fee_rate\s*\(/.test(migMinCoupon)) {
  fails.push("min/coupon migration must not depend on unapplied gift fee helper");
}

/** 1-J reopen (docs/dibay-delivery-product-hard-lock.md §7) — sellability in Pass 1 + stock sold_out reason */
{
  const mig1j = fs.readFileSync(
    path.join(root, "supabase/migrations/20270602130000_store_products_review_lock_stock_reason.sql"),
    "utf8"
  );
  if (!mig1j.includes("CREATE OR REPLACE FUNCTION public.create_store_order_atomic")) {
    fails.push("1-J migration must redefine create_store_order_atomic");
  }
  if (!/admin_review_status, 'none'\) IN \('rejected', 'pending'\)/.test(mig1j)) {
    fails.push("1-J create Pass1 must reject rejected/pending admin review");
  }
  if (!/ms\.is_hidden IS TRUE/.test(mig1j)) {
    fails.push("1-J create Pass1 must reject products in hidden menu sections");
  }
  if (!/sold_out_reason = CASE\s+WHEN stock_qty - v_qty <= 0 THEN 'stock'/.test(mig1j)) {
    fails.push("1-J create Pass2 must record sold_out_reason = 'stock'");
  }
  for (const k of ["FOR UPDATE", "pg_advisory_xact_lock", "WHEN unique_violation THEN", "insufficient_stock"]) {
    if (!mig1j.includes(k)) fails.push(`1-J create redefinition lost ${k}`);
  }
}

/** 2-E ADS-22 + 2-F FIN-15 reopen (doc §7) — coupon split = server authority, single cash order gate */
{
  const mig2ef = fs.readFileSync(
    path.join(root, "supabase/migrations/20270603150000_create_store_order_atomic_coupon_split_single_gate.sql"),
    "utf8"
  );
  if (!mig2ef.includes("CREATE OR REPLACE FUNCTION public.create_store_order_atomic")) {
    fails.push("2-E/2-F migration must redefine create_store_order_atomic");
  }
  if (/p_order->>'(store|platform)_funded_amount'/.test(mig2ef)) {
    fails.push("ADS-22: create must not store payload store/platform_funded_amount");
  }
  if (!/v_campaign\.funding_mode = 'STORE_FUNDED'/.test(mig2ef) || !/v_campaign\.store_funded_amount/.test(mig2ef)) {
    fails.push("ADS-22: create must split coupon cost from the locked campaign funding_mode/store_funded_amount");
  }
  if (!mig2ef.includes("store_orders_coupon_funding_split_check")) {
    fails.push("ADS-22: coupon split CHECK missing");
  }
  if (/point_commerce_blocked|store_point_blocked/.test(mig2ef.replace(/^--.*$/gm, ""))) {
    fails.push("FIN-15: create must not gate on legacy point_commerce_blocked (cash gate trigger is the single gate)");
  }
  for (const k of [
    "FOR UPDATE",
    "pg_advisory_xact_lock",
    "WHEN unique_violation THEN",
    "insufficient_stock",
    "v_discount := round(v_discount_auth)",
    "sold_out_reason = CASE",
  ]) {
    if (!mig2ef.includes(k)) fails.push(`2-E/2-F create redefinition lost ${k}`);
  }
}

/** 3단계 OPS-08 + LOC-004 reopen (doc §7) — effective opening / fulfillment re-check + order-time snapshot */
{
  const twin = fs.readFileSync(
    path.join(root, "supabase/migrations/20270604110000_store_front_commerce_open_sql_twin.sql"),
    "utf8"
  );
  const mig3 = fs.readFileSync(
    path.join(root, "supabase/migrations/20270604110100_create_store_order_atomic_ops08_loc004.sql"),
    "utf8"
  );
  const body = (sql, name) => {
    const s = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    const o = s >= 0 ? sql.indexOf("$fn$", s) : -1;
    const c = o >= 0 ? sql.indexOf("$fn$", o + 4) : -1;
    return c > o && o >= 0 ? sql.slice(o + 4, c) : "";
  };
  const twinBody = body(twin, "store_front_commerce_open");
  const rpcBody = body(mig3, "create_store_order_atomic");
  if (!twinBody) fails.push("OPS-08: SQL twin store_front_commerce_open missing");
  if (!/schedule_enforced/.test(twinBody)) {
    fails.push("OPS-08: SQL twin must require schedule_enforced (= readAutoBusinessHoursConfig)");
  }
  if (!rpcBody) fails.push("OPS-08/LOC-004 migration must redefine create_store_order_atomic");
  for (const [name, b] of [["store_front_commerce_open", twinBody], ["create_store_order_atomic", rpcBody]]) {
    if (/[^\x00-\x7F]/.test(b)) fails.push(`${name}: function body must be ASCII only`);
  }
  const gate = rpcBody.indexOf("public.store_front_commerce_open(v_store.business_hours_json, v_store.is_open, now())");
  const pay = rpcBody.indexOf("-- ROOT A: payment authority before mutate");
  const pass2 = rpcBody.indexOf("-- Pass 2+: mutate inside subtransaction");
  if (gate < 0) fails.push("OPS-08: create must re-check effective opening state via store_front_commerce_open");
  else if (!(pay >= 0 && gate > pay && pass2 > gate)) {
    fails.push("OPS-08: new checks must run last (after payment authority, before Pass 2)");
  }
  if (!/v_store\.pickup_available IS FALSE/.test(rpcBody) || !rpcBody.includes("'store_pickup_disabled'")) {
    fails.push("OPS-08: create must reject pickup when pickup_available = false (store_pickup_disabled)");
  }
  if (!/v_store\.delivery_available IS NOT TRUE/.test(rpcBody) || !rpcBody.includes("'store_delivery_disabled'")) {
    fails.push("OPS-08: create must reject local_delivery when delivery_available <> true (store_delivery_disabled)");
  }
  {
    const insertIdx = rpcBody.indexOf("INSERT INTO public.store_orders");
    const insertChunk = insertIdx >= 0 ? rpcBody.slice(insertIdx, rpcBody.indexOf("RETURNING id INTO v_order_id", insertIdx)) : "";
    for (const c of [
      "checkout_store_latitude",
      "checkout_store_longitude",
      "checkout_serviceability_eligible",
      "checkout_serviceability_max_km",
      "checkout_serviceability_reason",
    ]) {
      if (!insertChunk.includes(c)) fails.push(`LOC-004: create INSERT must record ${c} (same TX)`);
    }
  }
  for (const k of [
    "FOR UPDATE",
    "pg_advisory_xact_lock",
    "WHEN unique_violation THEN",
    "insufficient_stock",
    "v_discount := round(v_discount_auth)",
    "sold_out_reason = CASE",
    "v_campaign.funding_mode = 'STORE_FUNDED'",
  ]) {
    if (!rpcBody.includes(k)) fails.push(`OPS-08/LOC-004 create redefinition lost ${k}`);
  }
  if (/point_commerce_blocked|store_point_blocked/.test(rpcBody)) {
    fails.push("OPS-08/LOC-004 create must not re-add legacy point_commerce_blocked gate (FIN-15)");
  }
  if (/\.update\(serviceabilitySnapshot\)/.test(route)) {
    fails.push("LOC-004: route must not write the serviceability snapshot with a post-RPC UPDATE");
  }
  if (!route.includes("...(serviceabilitySnapshot && STORE_ORDER_SERVICEABILITY_SNAPSHOT_READY ? serviceabilitySnapshot : {})")) {
    fails.push("LOC-004: route must put the serviceability snapshot into the create_store_order_atomic payload");
  }
  const geoSync = fs.readFileSync(path.join(root, "lib/stores/sync-store-orders-checkout-geo.ts"), "utf8");
  if (!geoSync.includes(".update(storeOrderCheckoutEtaOnlyPatch(eta))")) {
    fails.push("LOC-004: store move refresh must update ETA fields only (no order-time distance overwrite)");
  }
}

if (fails.length) {
  console.error("FAIL: store-order-create-atomicity\n" + fails.join("\n"));
  process.exit(1);
}
console.log("PASS: store-order-create-atomicity");
process.exit(0);
