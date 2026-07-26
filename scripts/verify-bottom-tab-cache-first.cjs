/**
 * Bottom tab Cache-First — keep-alive hub Surfaces, no Instant dual-feed enter panel,
 * no (stores) remount group.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
let failed = false;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fail(msg) {
  failed = true;
  console.error(`verify:bottom-tab-cache-first: ${msg}`);
}

if (fs.existsSync(path.join(ROOT, "app/(stores)"))) {
  fail("app/(stores) route group must be removed — /stores lives under (main) to avoid Provider remount");
}

const storesPage = read("app/(main)/stores/page.tsx");
if (!storesPage.includes("StoresHub") || !storesPage.includes('data-stores-layout-profile="stores-hub"')) {
  fail("app/(main)/stores/page.tsx must render StoresHub with stores-hub marker");
}

const mypage = read("app/(main)/mypage/page.tsx");
if (/^\s*await\s+loadMypageServerShell/m.test(mypage) || /export\s+default\s+async\s+function\s+MypagePage/.test(mypage)) {
  fail("mypage/page.tsx must not blocking-await RSC shell");
}
if (!mypage.includes("<MyContent")) {
  fail("mypage/page.tsx must render MyContent without server await");
}

const transition = read("components/layout/MainShellTabContentTransition.tsx");
if (transition.includes("DeferredMainTabEnterPanel") || /\bsetTimeout\s*\(/.test(transition) || transition.includes("resolveMainTabEnterPanelDeferMs")) {
  fail("MainShellTabContentTransition must not defer tab enter with setTimeout");
}
if (
  /\bfunction\s+InstantMainTabEnterPanel\b/.test(transition) ||
  /\bTradeMarketTabPushEnterPanel\b/.test(transition) ||
  /from\s+["']@\/components\/market\/TradeMarketTabPushEnterPanel["']/.test(transition)
) {
  fail("MainShellTabContentTransition must not create Instant/Trade enter Feed panels");
}
if (!transition.includes("MainTabSurfaceKeepAlive")) {
  fail("MainShellTabContentTransition must host MainTabSurfaceKeepAlive");
}
if (!/pendingPushNode=\{null\}/.test(transition)) {
  fail("MainShellTabContentTransition must pass pendingPushNode={null}");
}

const keepAlive = read("components/layout/MainTabSurfaceKeepAlive.tsx");
if (!keepAlive.includes("CommunityHomeSurface") || !keepAlive.includes("MarketContent") || !keepAlive.includes("StoresHub")) {
  fail("MainTabSurfaceKeepAlive must own community/trade/delivery hub Surfaces");
}
if (!keepAlive.includes("MessengerHubRouteGate") || !keepAlive.includes("MyContent")) {
  fail("MainTabSurfaceKeepAlive must own chat/mypage hub Surfaces");
}

const cross = read("lib/navigation/main-shell-push-session.ts");
if (!/export function isCrossMainShellRouteGroup[\s\S]*return false/.test(cross)) {
  fail("isCrossMainShellRouteGroup must always return false (no remount boundary)");
}

const loadings = [
  "app/(main)/philife/loading.tsx",
  "app/(main)/market/loading.tsx",
  "app/(main)/stores/loading.tsx",
  "app/(main)/community-messenger/loading.tsx",
  "app/(main)/mypage/loading.tsx",
];
for (const rel of loadings) {
  const src = read(rel);
  if (!src.includes("return null")) {
    fail(`${rel} must return null`);
  }
  if (/MainFeedRouteLoading|CommunityFeedSkeleton|animate-pulse/.test(src)) {
    fail(`${rel} must not render skeleton`);
  }
}

if (failed) process.exit(1);
console.log("verify:bottom-tab-cache-first: ok");
