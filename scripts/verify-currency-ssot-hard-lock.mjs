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
if (!anchor.includes("LEGACY_HISTORICAL_DATA_IS_NOT_PRODUCT = true")) {
  fail("hard-lock must separate historical evidence from active products");
}

const display = read("lib/currency/currency-display-contract.ts");
if (!display.includes("formatCurrencyAmount")) {
  fail("currency-display-contract must export formatCurrencyAmount");
}
if (!display.includes('coin: { en: "Coin", ko: "Coin" }')) {
  fail("Coin must use the canonical Coin label in all languages");
}
if (!display.includes('cash: { en: "Cash", ko: "캐시" }')) {
  fail("Cash must use the canonical Cash/캐시 label");
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
if (!doc.includes("Historical data may remain for accounting evidence")) {
  fail("hard-lock must forbid historical data from preserving a product");
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

const writerKill = read(
  "supabase/migrations/20261202140000_three_currency_legacy_writer_kill.sql"
);
for (const name of [
  "charge_store_points_on_order_accept",
  "approve_store_point_charge_request",
  "adjust_store_point_balance",
  "gift_certificate_conversion_request",
  "gift_certificate_cash_out_request",
  "store_cash_delivery_ad_spend",
  "owner_fund_delivery_ad_campaign",
]) {
  if (!writerKill.includes(name)) fail(`legacy writer kill migration missing ${name}`);
}

const transition = read("lib/stores/apply-store-order-status-transition.ts");
if (
  transition.includes("chargeStorePointsOnOrderAccept") ||
  transition.includes("charge_store_points_on_order_accept")
) {
  fail("order accept must not debit a historical store-credit product");
}

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
  const src = readFileSync(abs, "utf8");
  for (const pat of forbiddenPatterns) {
    if (pat.test(src)) {
      fail(`forbidden legacy writer pattern in ${rel}`);
    }
  }
}

console.log("PASS: currency-ssot-hard-lock");
process.exit(0);
