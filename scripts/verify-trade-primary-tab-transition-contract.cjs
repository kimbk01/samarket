/**
 * 거래·하단 탭 Surface 계약 — Single Surface KeepAlive (임시 enter panel 금지).
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
if (!appTransition.includes("isMainTabKeepAliveHubPath") && !appTransition.includes("isKeepAliveHubRouteTransition")) {
  fail("AppRouteTransition must skip dual-panel for keep-alive hub transitions");
}
if (/MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES\s*=\s*new Set\(\s*\[[^\]]*trade-primary/.test(appTransition)) {
  fail("MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES must not arm trade-primary temporary enter panels");
}

const mainShell = read("components/layout/MainShellTabContentTransition.tsx");
if (/\bTradeMarketTabPushEnterPanel\b/.test(mainShell) || /\bfunction\s+InstantMainTabEnterPanel\b/.test(mainShell)) {
  fail("MainShellTabContentTransition must not render temporary Trade/Instant enter panels");
}
if (!mainShell.includes("pendingPushNode={null}") && !/pendingPushNode=\{null\}/.test(mainShell)) {
  fail("MainShellTabContentTransition must pass pendingPushNode={null}");
}
if (mainShell.includes("MainFeedRouteLoading")) {
  fail("MainShellTabContentTransition must not import/render MainFeedRouteLoading for menu transitions");
}
if (mainShell.includes("CommunityMessengerHomeShellSkeleton")) {
  fail("MainShellTabContentTransition must not render messenger skeleton during main bottom-nav transitions");
}

const tradeTabs = read("components/trade/TradePrimaryTabs.tsx");
if (!tradeTabs.includes("commitTradePrimaryTabRoute")) {
  fail("TradePrimaryTabs must use commitTradePrimaryTabRoute");
}
/** 거래 E 탭 줄(Owner 2026-10-28 · 판매·둘러보기·지역·카테고리)은 button 탭 — Link 기본 이동으로 가드·커밋을 우회하지 않는다 */
if (/<Link\b/.test(tradeTabs)) {
  fail("TradePrimaryTabs tab row must use buttons, not Link default navigation");
}
if (!tradeTabs.includes("guardBeforeNavigate(href)")) {
  fail("TradePrimaryTabs tab navigation must pass guardBeforeNavigate");
}
if (!tradeTabs.includes("commitTab(href, tabKey)")) {
  fail("TradePrimaryTabs 더보기 apply must use commitTradePrimaryTabRoute");
}
if (!tradeTabs.includes("MarketplaceMoreBrowseSheet")) {
  fail("TradePrimaryTabs 더보기 must use MarketplaceMoreBrowseSheet");
}


/** 하단 탭 허브 첫 화면은 loading 이 아무것도 그리지 않는다 — 하위 화면만 DIBAY 대기 스피너(loading-spinner 설계 W1) */
function mainTabLoadingKeepsHubNull(src) {
  // 내정보 허브는 하단 탭 계약 v2 의 허브 뼈대(`BottomNavHubSkeleton`)가 첫 화면 — 하위 화면만 대기 스피너
  return (
    src.includes("return null") ||
    src.includes("return <MainSegmentPendingLoading") ||
    src.includes('return <BottomNavHubSkeleton hub="mypage" />')
  );
}
const segmentPending = read("components/layout/MainSegmentPendingLoading.tsx");
if (!segmentPending.includes("if (isMainTabKeepAliveHubPath(pathname)) return null;")) {
  fail("MainSegmentPendingLoading must render nothing on bottom-nav hub roots");
}
const marketLoading = read("app/(main)/market/loading.tsx");
if (!mainTabLoadingKeepsHubNull(marketLoading)) {
  fail("app/(main)/market/loading.tsx must return null on the hub root");
}

const mainTabLoadingFiles = [
  "app/(main)/philife/loading.tsx",
  "app/(main)/market/loading.tsx",
  "app/(main)/stores/loading.tsx",
  "app/(main)/community-messenger/loading.tsx",
  "app/(main)/mypage/loading.tsx",
  "app/(main)/my/loading.tsx",
];
if (fs.existsSync(path.join(root, "app/(stores)"))) {
  fail("app/(stores) must be removed — /stores under (main) only");
}
for (const rel of mainTabLoadingFiles) {
  const source = read(rel);
  if (!mainTabLoadingKeepsHubNull(source)) {
    fail(`${rel} must return null on hub roots for main bottom-nav transitions`);
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
/**
 * 피드 스켈레톤은 피드 안에만, 스냅샷·목록이 있으면 스켈레톤 없이 바로 그린다
 * (docs/mypage-v2/dibay-mypage-v3-real-screen-redesign.md §13-2·3). 루트 loading.tsx 금지는 위 mainTabLoadingFiles.
 */
const feedSkeletonUses = communityFeed.match(/<CommunityFeedSkeleton\b/g) ?? [];
if (feedSkeletonUses.length > 1) {
  fail("CommunityFeed must own a single feed skeleton");
}
if (
  feedSkeletonUses.length === 1 &&
  !/loading && postsForList\.length === 0 && !err \? \(\s*<CommunityFeedSkeleton\b/.test(communityFeed)
) {
  fail("CommunityFeed skeleton must render only while loading with no posts (snapshot paints without skeleton)");
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
