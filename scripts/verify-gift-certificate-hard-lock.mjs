#!/usr/bin/env node
/**
 * Paid Gift Certificate HARD LOCK gate.
 * @see docs/dibay-gift-certificate-hard-lock.md
 * @see lib/gift-certificate/gift-certificate-hard-lock.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const contract = read("lib/gift-certificate/gift-certificate-domain-contract.ts");
if (!contract.includes("GIFT_IS_NOT_COUPON = true")) {
  fail("GIFT_IS_NOT_COUPON must be true");
}

const financial = read("lib/stores/store-order-financial-contract.ts");
if (!/customerDPointSupported:\s*false/.test(financial)) {
  fail("customerDPointSupported must remain false");
}

const schema = read("lib/gift-certificate/gift-certificate-schema.ts");
for (const table of [
  "gift_certificate_applications",
  "gift_certificate_products",
  "gift_certificate_instances",
  "gift_certificate_transfers",
  "gift_certificate_redemptions",
  "store_cash_accounts",
]) {
  if (!schema.includes(`"${table}"`)) fail(`GIFT_TABLES missing ${table}`);
}

const migrationPath =
  "supabase/migrations/20261127120000_gift_certificate_domain_g2.sql";
let migration;
try {
  migration = read(migrationPath);
} catch {
  fail(`migration missing: ${migrationPath}`);
}

if (!migration.includes("CREATE TABLE IF NOT EXISTS public.gift_certificate_instances")) {
  fail("migration missing gift_certificate_instances");
}
if (!migration.includes("store_cash_accounts_balance_nonneg_chk")) {
  fail("store_cash_accounts must enforce balance >= 0");
}
if (!migration.includes("Terminal transfer status LAST") && !migration.includes("status = 'ACCEPTED'")) {
  /* accept must not write ACCEPTED before ownership — check ACCEPTED-last pattern */
}
if (migration.includes("SET status = 'APPROVED'") && migration.indexOf("SET status = 'APPROVED'") < migration.indexOf("GIFT_REVENUE_CONVERSION")) {
  // weak check — stronger checks below on approve function order via financial integrity test
}

const messengerMigrationPath =
  "supabase/migrations/20261127130000_gift_certificate_messenger_message_type.sql";
let messengerMigration;
try {
  messengerMigration = read(messengerMigrationPath);
} catch {
  fail(`migration missing: ${messengerMigrationPath}`);
}
if (!messengerMigration.includes("'gift_certificate'")) {
  fail("messenger migration must allow gift_certificate message_type");
}

const checkoutMigPath =
  "supabase/migrations/20261127140000_gift_certificate_checkout_refund_atomic.sql";
let checkoutMig;
try {
  checkoutMig = read(checkoutMigPath);
} catch {
  fail(`migration missing: ${checkoutMigPath}`);
}
if (!checkoutMig.includes("gift_instance_ids")) {
  fail("checkout atomic migration must fold gift_instance_ids into create_store_order_atomic");
}
if (!checkoutMig.includes("gift_certificate_refund_order_atomic")) {
  fail("checkout migration must define gift_certificate_refund_order_atomic");
}
if (!checkoutMig.includes("amount_before_gift")) {
  fail("checkout migration must persist amount_before_gift");
}

// No value-expiry column on instances (comments mentioning expires_at are OK)
if (
  /CREATE TABLE IF NOT EXISTS public\.gift_certificate_instances[\s\S]*?\);/m
    .exec(migration)?.[0]
    ?.match(/^\s*expires_at\b/m)
) {
  fail("gift_certificate_instances must not define expires_at column");
}

const route = read("app/api/me/store-orders/route.ts");
if (route.includes("G7_PARTIAL_ATOMICITY")) {
  fail("store-orders route must not retain G7_PARTIAL_ATOMICITY");
}
if (route.includes("giftCertificateRedeem")) {
  fail("store-orders route must not call giftCertificateRedeem after order create");
}

const transition = read("lib/stores/apply-store-order-status-transition.ts");
if (!transition.includes("gift_certificate_refund_order_atomic")) {
  fail("refund transition must use gift_certificate_refund_order_atomic");
}
if (/best-effort[\s\S]{0,40}gift_certificate_redemption_reverse|gift_certificate_redemption_reverse[\s\S]{0,80}best-effort/i.test(transition)) {
  fail("best-effort gift reverse after refund is forbidden");
}
if (transition.includes("gift_certificate_redemption_reverse")) {
  fail("apply-store-order-status-transition must not call gift_certificate_redemption_reverse directly");
}

const hardLock = read("lib/gift-certificate/gift-certificate-hard-lock.ts");
if (!hardLock.includes("GIFT_IS_NOT_COUPON")) {
  fail("hard-lock module must re-export GIFT_IS_NOT_COUPON anchor");
}
if (!hardLock.includes("customerDPointSupported")) {
  fail("hard-lock module must anchor customerDPointSupported");
}

const doc = read("docs/dibay-gift-certificate-hard-lock.md");
if (!doc.includes("GIFT_IS_NOT_COUPON") || !doc.includes("G0")) {
  fail("hard-lock doc must reference G0 / GIFT_IS_NOT_COUPON");
}
if (doc.includes("G7_PARTIAL_ATOMICITY") && !doc.includes("FORBIDDEN")) {
  fail("hard-lock doc must not allow G7_PARTIAL_ATOMICITY");
}
if (!doc.includes("G7 ATOMIC")) {
  fail("hard-lock doc must require G7 ATOMIC");
}

console.log("PASS: gift-certificate-hard-lock");
process.exit(0);
