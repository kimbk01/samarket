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
if (!mainShell.includes("isMarketMenuIntentPath") || !mainShell.includes("pendingMenuIntent.href")) {
  fail("bottom-nav navigation to /market must use TradeMarketTabPushEnterPanel, not MainFeedRouteLoading");
}
for (const token of ["PhilifeFeedClientEntry", "StoresHub", "CommunityMessengerHome", "MyContent"]) {
  if (!mainShell.includes(token)) {
    fail(`MainShellTabContentTransition must provide a non-skeleton pending enter panel for ${token}`);
  }
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
  "app/(stores)/stores/loading.tsx",
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
if (!computeAxis.includes('toTabIndex > fromTabIndex ? "rtl" : "ltr"')) {
  fail("compute-trade-primary-push-axis must use tab index order, not canonical nav");
}

const homeProductList = read("components/home/HomeProductList.tsx");
if (homeProductList.includes("<LoadingState") || homeProductList.includes("function LoadingState")) {
  fail("HomeProductList must not render the card skeleton LoadingState on /market");
}
if (/function\s+NonSkeletonLoadingState[\s\S]*animate-pulse/.test(homeProductList)) {
  fail("HomeProductList non-skeleton loading state must not contain animate-pulse placeholders");
}

const communityFeed = read("components/community/CommunityFeed.tsx");
if (communityFeed.includes("<CommunityFeedSkeleton")) {
  fail("CommunityFeed root loading must not render card skeleton during main bottom-nav transitions");
}

const storesHub = read("components/stores/home/hub/StoresHomeHub.tsx");
if (storesHub.includes("<StoresHomeSkeleton")) {
  fail("StoresHomeHub root loading must not render delivery skeleton during main bottom-nav transitions");
}

const messengerListPane = read("components/community-messenger/CommunityMessengerHomeListPane.tsx");
if (messengerListPane.includes("CommunityMessengerHomeShellSkeleton")) {
  fail("CommunityMessengerHomeListPane must not render messenger skeleton during main bottom-nav transitions");
}

const routeConfig = read("components/route-transition/route-transition-config.ts");
if (!routeConfig.includes("TRADE_MARKET_CACHE_HIT_PUSH_MS = 250")) {
  fail("route-transition-config must define TRADE_MARKET_CACHE_HIT_PUSH_MS = 250");
}

const pushDuration = read("lib/navigation/resolve-main-shell-push-duration-ms.ts");
if (!pushDuration.includes("peekCachedPostsForHome") || !pushDuration.includes("TRADE_MARKET_CACHE_HIT_PUSH_MS")) {
  fail("resolve-main-shell-push-duration-ms must gate cache-hit push on peekCachedPostsForHome");
}

const appTransitionDuration = read("components/route-transition/AppRouteTransition.tsx");
if (!appTransitionDuration.includes("resolveMainShellPushDurationMs") || !appTransitionDuration.includes("durationMs")) {
  fail("AppRouteTransition must branch push duration via resolveMainShellPushDurationMs");
}

const tradePrewarm = read("lib/main-menu/bottom-nav-tap-prewarm-trade.ts");
if (!tradePrewarm.includes("peekCachedPostsForHome")) {
  fail("bottom-nav-tap-prewarm-trade must skip via peekCachedPostsForHome");
}

if (failed) {
  process.exit(1);
}
console.log("verify-trade-primary-tab-transition: ok");
