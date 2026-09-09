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

if (fails.length) {
  console.error("FAIL: store-order-create-atomicity\n" + fails.join("\n"));
  process.exit(1);
}
console.log("PASS: store-order-create-atomicity");
process.exit(0);
