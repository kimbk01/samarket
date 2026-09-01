#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

const display = read("lib/currency/currency-display-contract.ts");
for (const anchor of [
  'point: { en: "Point", ko: "포인트" }',
  'coin: { en: "Coin", ko: "Coin" }',
  'cash: { en: "Cash", ko: "캐시" }',
]) {
  if (!display.includes(anchor)) fail(`canonical display label missing: ${anchor}`);
}

const ownerHome = read("components/stores/owner/dashboard/OwnerOperationsDashboard.tsx");
if (ownerHome.includes("OwnerStorePointWarningCard")) {
  fail("ordinary Owner home still exposes the former store-credit product");
}
if (ownerHome.includes("OwnerGiftRevenueHomeCard")) {
  fail("ordinary Owner home still exposes Gift revenue as a wallet");
}
if (!/OwnerFinanceHomeCards|Currency.*Home|CurrencyBalanceCard|OwnerStoreFinance/.test(ownerHome)) {
  fail("ordinary Owner home does not expose canonical Coin/Cash finance");
}

const ownerFinance = read("components/business/owner/OwnerStoreFinanceView.tsx");
if (
  ownerFinance.includes("LegacyCreditBadge") ||
  ownerFinance.includes("OwnerStorePointWarningCard")
) {
  fail("Owner Finance still exposes a fourth currency product");
}
for (const currency of ['currency="coin"', 'currency="cash"']) {
  if (!ownerFinance.includes(currency)) fail(`Owner Finance missing ${currency}`);
}

const transition = read("lib/stores/apply-store-order-status-transition.ts");
if (/chargeStorePointsOnOrderAccept|charge_store_points_on_order_accept/.test(transition)) {
  fail("order accept can still debit a historical store-credit product");
}

const migration = read(
  "supabase/migrations/20261202140000_three_currency_legacy_writer_kill.sql"
);
for (const writer of [
  "charge_store_points_on_order_accept",
  "approve_store_point_charge_request",
  "adjust_store_point_balance",
  "gift_certificate_conversion_request",
  "gift_certificate_cash_out_request",
  "store_cash_delivery_ad_spend",
  "owner_fund_delivery_ad_campaign",
]) {
  if (!migration.includes(writer)) fail(`legacy writer kill missing ${writer}`);
}

const forbidden = [
  /\bD-Point\b/i,
  /\bBusiness Credit\b/i,
  /\bBusiness Cash\b/i,
  /\bStore Points?\b/i,
  /\bEconomic Point\b/i,
  /\b(?:Gift )?Store Cash\b/i,
  /\bGift Cash\b/i,
  /매장 포인트/,
  /비즈니스 캐시/,
  /매장 Cash/i,
];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function walk(directory, out = []) {
  if (!existsSync(directory)) return out;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (path.includes("/components/admin/users")) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const runtimeRoots = [
  resolve(root, "components"),
  resolve(root, "app/(main)"),
  resolve(root, "app/admin"),
  resolve(root, "lib/i18n/catalog"),
];

for (const path of runtimeRoots.flatMap((dir) => walk(dir))) {
  const source = stripComments(readFileSync(path, "utf8"));
  for (const pattern of forbidden) {
    if (pattern.test(source)) {
      fail(`reachable fourth-currency terminology ${pattern} in ${relative(root, path)}`);
    }
  }
}

console.log("PASS: three-currency-product");
