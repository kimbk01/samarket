#!/usr/bin/env node
/**
 * DIBAY Currency SSOT HARD LOCK gate.
 * @see docs/dibay-currency-ssot-hard-lock.md
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const anchor = read("lib/currency/currency-ssot-hard-lock.ts");
if (!anchor.includes('GIFT_CASH_OUT_MERGED_INTO_COIN_WITHDRAWAL = true')) {
  fail("Gift cash-out must merge into Coin withdrawal rail");
}
if (!anchor.includes("store_economic_point_accounts")) {
  fail("COIN authority must reference store_economic_point_accounts");
}
if (!anchor.includes("business_cash_accounts")) {
  fail("CASH authority must reference business_cash_accounts");
}
if (!anchor.includes("CURRENCY_LEGACY_WRITER_ALLOWLIST")) {
  fail("hard-lock must define legacy writer allowlist");
}

const display = read("lib/currency/currency-display-contract.ts");
if (!display.includes("formatCurrencyAmount")) {
  fail("currency-display-contract must export formatCurrencyAmount");
}
if (!display.includes('coin: ["convert_to_cash", "withdraw", "history"]')) {
  fail("Coin actions must exclude recharge");
}
if (!display.includes('cash: ["top_up", "convert_from_coin", "history"]')) {
  fail("Cash actions must exclude withdraw");
}

const doc = read("docs/dibay-currency-ssot-hard-lock.md");
if (!doc.includes("POINT ≠ COIN ≠ CASH")) {
  fail("hard-lock doc must state separation invariant");
}
if (!doc.includes("components/currency")) {
  fail("hard-lock doc must reference currency components");
}

const matrix = read("docs/dibay-currency-visual-surface-matrix.md");
if (!matrix.includes("/stores/owner/finance")) {
  fail("visual matrix must include owner finance route");
}

const mig = read("supabase/migrations/20261201300000_delivery_ads_canonical_finance_ast004_ast005.sql");
if (!mig.includes("business_cash_accounts")) {
  fail("AST-005 migration must exist");
}
if (!mig.includes("store_economic_point_accounts")) {
  fail("AST-004 migration must exist");
}

const coinMigPath = "supabase/migrations/20261202000000_currency_coin_ssot_cut2.sql";
try {
  const coinMig = read(coinMigPath);
  if (!coinMig.includes("coin_withdrawal_requests")) {
    fail("CUT2 migration must define coin_withdrawal_requests");
  }
  if (!coinMig.includes("credit_coin_from_settlement")) {
    fail("CUT2 migration must define credit_coin_from_settlement");
  }
} catch {
  fail(`migration missing: ${coinMigPath}`);
}

// Ads/partner spend must reference AST-005 canonical contract
const canonicalCash = read("lib/stores/advertising/canonical-business-cash-contract.ts");
if (!canonicalCash.includes("business_cash_accounts")) {
  fail("canonical-business-cash-contract must anchor AST-005");
}

// Forbidden legacy writers outside allowlist
const allowlist = [
  "lib/stores/advertising/delivery-ad-store-cash-writer.ts",
  "lib/gift-certificate/gift-certificate-rpc.ts",
];
const forbiddenPatterns = [
  /\.from\(["']delivery_ad_accounts["']\)[\s\S]{0,240}\.(insert|update|upsert)\(/,
  /\.from\(["']store_cash_accounts["']\)[\s\S]{0,240}\.(insert|update|upsert)\(/,
];

function walkTs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "__tests__") continue;
      walkTs(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

for (const abs of walkTs(root)) {
  const rel = abs.slice(root.length + 1);
  if (rel.startsWith("supabase/")) continue;
  if (allowlist.some((a) => rel === a || rel.endsWith(a))) continue;
  const src = readFileSync(abs, "utf8");
  for (const pat of forbiddenPatterns) {
    if (pat.test(src)) {
      fail(`forbidden legacy writer pattern in ${rel}`);
    }
  }
}

console.log("PASS: currency-ssot-hard-lock");
process.exit(0);
