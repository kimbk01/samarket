/**
 * 거래 1차 탭 440ms push 계약 — 구조 역행 grep.
 * 규칙: `.cursor/rules/trade-primary-tab-transition-contract.mdc`
 *
 * 사용: npm run verify:trade-primary-tab-transition
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

let failed = false;

function fail(msg) {
  console.error(`verify-trade-primary-tab-transition: ${msg}`);
  failed = true;
}

const appTransition = read("components/route-transition/AppRouteTransition.tsx");
if (!appTransition.includes('"trade-primary"') || !appTransition.includes("MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES")) {
  fail('AppRouteTransition must include trade-primary in MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES');
}

const mainShell = read("components/layout/MainShellTabContentTransition.tsx");
if (!mainShell.includes("TradeMarketTabPushEnterPanel")) {
  fail("MainShellTabContentTransition must render TradeMarketTabPushEnterPanel for trade-primary");
}
if (!mainShell.includes('"trade-primary"')) {
  fail('MainShellTabContentTransition must exempt trade-primary from blocking overlay');
}

const tradeTabs = read("components/trade/TradePrimaryTabs.tsx");
if (!tradeTabs.includes("commitTradePrimaryTabRoute")) {
  fail("TradePrimaryTabs must use commitTradePrimaryTabRoute");
}
if (!tradeTabs.includes("e.preventDefault()")) {
  fail("TradePrimaryTabs Link onClick must preventDefault");
}
const linkClickBlock = tradeTabs.match(/onClick=\{\(e\) => \{[\s\S]*?commitTradePrimaryTabRoute/);
if (!linkClickBlock) {
  fail("TradePrimaryTabs category Link onClick must call commitTradePrimaryTabRoute");
}

const marketLoading = read("app/(main)/market/loading.tsx");
if (!marketLoading.includes("return null")) {
  fail("app/(main)/market/loading.tsx must return null");
}

const computeAxis = read("lib/trade/tabs/compute-trade-primary-push-axis.ts");
if (!computeAxis.includes("toTabIndex > fromTabIndex")) {
  fail("compute-trade-primary-push-axis must use tab index order, not canonical nav");
}

if (failed) {
  process.exit(1);
}
console.log("verify-trade-primary-tab-transition: ok");
