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

// No value-expiry column on instances (comments mentioning expires_at are OK)
if (
  /CREATE TABLE IF NOT EXISTS public\.gift_certificate_instances[\s\S]*?\);/m
    .exec(migration)?.[0]
    ?.match(/^\s*expires_at\b/m)
) {
  fail("gift_certificate_instances must not define expires_at column");
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

console.log("PASS: gift-certificate-hard-lock");
process.exit(0);
