#!/usr/bin/env node
/**
 * Currency visual SSOT contract gate.
 * @see docs/dibay-currency-ssot-hard-lock.md § Visual Identity
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const root = process.cwd();

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const tokens = read("app/design-tokens.css");
for (const t of [
  "--currency-point-bg",
  "--currency-coin-bg",
  "--currency-cash-bg",
  "--currency-point-accent",
  "--currency-coin-accent",
  "--currency-cash-accent",
]) {
  if (!tokens.includes(t)) fail(`design-tokens missing ${t}`);
}

const css = read("app/samarket-components.css");
for (const c of [
  "currency-card--point",
  "currency-card--coin",
  "currency-card--cash",
  "currency-badge--point",
  "currency-badge--coin",
  "currency-badge--cash",
]) {
  if (!css.includes(c)) fail(`samarket-components missing ${c}`);
}

const currencyDir = resolve(root, "components/currency");
const required = [
  "CurrencyBalanceCard.tsx",
  "CurrencyAmount.tsx",
  "CurrencyBadge.tsx",
  "CurrencyHistoryRow.tsx",
  "CurrencyActionGroup.tsx",
  "index.ts",
];
for (const f of required) {
  try {
    read(`components/currency/${f}`);
  } catch {
    fail(`missing components/currency/${f}`);
  }
}

const actionGroup = read("components/currency/CurrencyActionGroup.tsx");
if (!actionGroup.includes("CURRENCY_ALLOWED_ACTIONS")) {
  fail("CurrencyActionGroup must enforce allowed actions from contract");
}
if (actionGroup.includes("recharge") && !actionGroup.includes("filterAllowedActions")) {
  fail("CurrencyActionGroup must filter forbidden actions");
}

const balanceCard = read("components/currency/CurrencyBalanceCard.tsx");
if (!balanceCard.includes("data-currency-balance-card")) {
  fail("CurrencyBalanceCard must expose data-currency-balance-card");
}

// Forbid page-local currency card patterns in owner finance target (after CUT 4)
const financeView = read("components/business/owner/OwnerStoreFinanceView.tsx");
if (!financeView.includes("CurrencyBalanceCard")) {
  fail("OwnerStoreFinanceView must use CurrencyBalanceCard");
}
if (!financeView.includes('currency="coin"') || !financeView.includes('currency="cash"')) {
  fail("OwnerStoreFinanceView must render coin and cash variants");
}

const adminFinance = read("components/admin/finance/AdminStoreFinancePanels.tsx");
if (!adminFinance.includes("CurrencyBadge")) {
  fail("AdminStoreFinancePanels must use CurrencyBadge");
}

console.log("PASS: currency-visual-ssot-contract");
process.exit(0);
