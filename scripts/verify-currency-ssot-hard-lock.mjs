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
if (!anchor.includes("POINT_FUNGIBILITY_CONTRACT")) {
  fail("Point fungibility contract must be anchored");
}
if (!anchor.includes('giftSpendSourceGate: "NONE"')) {
  fail("Point gift spend must remain fungible (no source gate)");
}
if (!anchor.includes("CASH_DIRECT_BALANCE_MUTATION_FORBIDDEN = true")) {
  fail("Cash direct balance mutation must be forbidden (F-02)");
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
if (!doc.includes("POINT fungibility contract")) {
  fail("hard-lock doc must include POINT fungibility contract");
}
if (!doc.includes("CASH ledger row integrity")) {
  fail("hard-lock doc must include CASH ledger row integrity");
}

const f02Mig = "supabase/migrations/20270118120000_finance_f02_cash_balance_writer_lock.sql";
try {
  const f02 = read(f02Mig);
  if (!f02.includes("REVOKE INSERT, UPDATE, DELETE ON public.business_cash_accounts FROM service_role")) {
    fail("F-02 migration must revoke service_role direct Cash account writes");
  }
  if (!f02.includes("bc_balance_after_minor")) {
    fail("F-02 migration must refresh convert post-settle balance");
  }
} catch {
  fail(`migration missing: ${f02Mig}`);
}

const f03Mig = "supabase/migrations/20270118130000_finance_f03_conversion_policy_limits_apply.sql";
try {
  const f03 = read(f03Mig);
  if (!f03.includes("minimum_coin_per_conversion")) {
    fail("F-03 migration must apply minimum_coin_per_conversion");
  }
  if (!f03.includes("MIGRATION_NOT_APPLIED") && !f03.includes("F-03")) {
    fail("F-03 migration must document apply purpose");
  }
} catch {
  fail(`migration missing: ${f03Mig}`);
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
  /\.from\(["']business_cash_accounts["']\)[\s\S]{0,240}\.(insert|update|upsert)\(/,
];

function walkTs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (
      name === "node_modules" ||
      name === ".next" ||
      name === ".qa-logs" ||
      name === ".tmp" ||
      name === ".git" ||
      name === ".worktrees" ||
      name === ".recovery" ||
      name === ".capacitor" ||
      name === "android" ||
      name === "ios" ||
      name === "coverage"
    ) {
      continue;
    }
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "__tests__") continue;
      walkTs(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const scanRoots = ["app", "components", "lib", "scripts"].map((d) => join(root, d));
const tsFiles = [];
for (const dir of scanRoots) {
  try {
    walkTs(dir, tsFiles);
  } catch {
    /* skip missing roots */
  }
}

for (const abs of tsFiles) {
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
