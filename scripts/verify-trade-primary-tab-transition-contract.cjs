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
if (mainShell.includes("MainFeedRouteLoading")) {
  fail("MainShellTabContentTransition must not import/render MainFeedRouteLoading for menu transitions");
}
if (mainShell.includes("CommunityMessengerHomeShellSkeleton")) {
  fail("MainShellTabContentTransition must not render messenger skeleton during main bottom-nav transitions");
}
if (!mainShell.includes('"trade-primary"')) {
  fail('MainShellTabContentTransition must exempt trade-primary from blocking overlay');
}
if (!mainShell.includes("isMarketMenuIntentPath") || !mainShell.includes("pendingMenuIntent.pathname")) {
  fail("bottom-nav navigation to /market must use TradeMarketTabPushEnterPanel, not MainFeedRouteLoading");
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

const mainTabLoadingFiles = [
  "app/(main)/philife/loading.tsx",
  "app/(main)/market/loading.tsx",
  "app/(main)/stores/loading.tsx",
  "app/(main)/community-messenger/loading.tsx",
  "app/(main)/mypage/loading.tsx",
  "app/(main)/my/loading.tsx",
];
for (const rel of mainTabLoadingFiles) {
  const source = read(rel);
  if (!source.includes("return null")) {
    fail(`${rel} must return null for main bottom-nav transitions`);
  }
  if (/MainFeedRouteLoading|CommunityFeedSkeleton|CommunityMessengerHomeShellSkeleton|animate-pulse/.test(source)) {
    fail(`${rel} must not render skeleton placeholders`);
  }
}

const computeAxis = read("lib/trade/tabs/compute-trade-primary-push-axis.ts");
if (!computeAxis.includes("toTabIndex > fromTabIndex")) {
  fail("compute-trade-primary-push-axis must use tab index order, not canonical nav");
}

const homeProductList = read("components/home/HomeProductList.tsx");
if (homeProductList.includes("<LoadingState") || homeProductList.includes("function LoadingState")) {
  fail("HomeProductList must not render the card skeleton LoadingState on /market");
}
if (/function\s+NonSkeletonLoadingState[\s\S]*animate-pulse/.test(homeProductList)) {
  fail("HomeProductList non-skeleton loading state must not contain animate-pulse placeholders");
}

if (failed) {
  process.exit(1);
}
console.log("verify-trade-primary-tab-transition: ok");
