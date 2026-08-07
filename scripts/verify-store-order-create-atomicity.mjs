#!/usr/bin/env node
/**
 * Phase 5 — POST create must use createStoreOrderAtomic; no app-layer stock compensate.
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

const fails = [];
if (!route.includes("createStoreOrderAtomic")) {
  fails.push("route missing createStoreOrderAtomic");
}
if (route.includes("restoreDecrementedStock") || route.includes("stockRollback")) {
  fails.push("route still has app-layer stock compensate");
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
if (!route.includes("notifyStoreOwnerNewOrder")) {
  fails.push("route missing post-commit owner notify");
}

if (fails.length) {
  console.error("FAIL: store-order-create-atomicity\n" + fails.join("\n"));
  process.exit(1);
}
console.log("PASS: store-order-create-atomicity");
process.exit(0);
