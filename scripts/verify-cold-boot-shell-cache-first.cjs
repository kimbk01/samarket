#!/usr/bin/env node
/**
 * Cold Boot Shell/Cache-First 계약 검증.
 * DO NOT: `/`·`/home`·`/community` HTTP redirect · philife Suspense skeleton · splash timeout/homeVisible gate · sessionStorage-only feed · cache-wait blank.
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
  console.error(`verify-cold-boot-shell-cache-first: ${msg}`);
}

if (fs.existsSync(path.join(ROOT, "app/page.tsx"))) {
  fail("app/page.tsx must not exist — home is app/(main)/page.tsx (no root redirect)");
}

if (fs.existsSync(path.join(ROOT, "app/(main)/philife/PhilifeFeedRscSeed.tsx"))) {
  fail("PhilifeFeedRscSeed.tsx must be removed — RSC must not gate cold first paint");
}

for (const rel of [
  "app/(main)/page.tsx",
  "app/(main)/home/page.tsx",
  "app/(main)/community/page.tsx",
  "app/(main)/philife/page.tsx",
]) {
  const src = read(rel);
  if (/redirect\s*\(/.test(src)) {
    fail(`${rel} must not redirect (render PhilifeHomeFeedPage directly)`);
  }
  if (!src.includes("PhilifeHomeFeedPage") && !src.includes("CommunityHomeSurface")) {
    fail(`${rel} must render CommunityHomeSurface (or PhilifeHomeFeedPage alias)`);
  }
}

const philifePage = read("app/(main)/philife/page.tsx");
if (
  /\bimport\s*\{[^}]*Suspense|\bSuspense\s*>|<Suspense\b|MainFeedRouteLoading|PhilifeFeedRscSeed/.test(
    philifePage
  )
) {
  fail("philife/page.tsx must not use Suspense/MainFeedRouteLoading/RscSeed for cold first paint");
}

const bootMetrics = read("lib/app-boot/dibay-boot-metrics.ts");
if (
  !bootMetrics.includes("markBootMetricsShellReady") ||
  !bootMetrics.includes('tryDismissNativeSplash("shellReady")')
) {
  fail("dibay-boot-metrics must dismiss splash on shellReady");
}
if (
  /SPLASH_SAFETY_TIMEOUT_MS|scheduleSplashSafetyTimeout|tryDismissNativeSplash\("splash_safety_timeout"\)/.test(
    bootMetrics
  )
) {
  fail("dibay-boot-metrics must not use splash safety timeout as dismiss gate");
}
if (
  /tryDismissNativeSplash\("homeVisible"\)|tryDismissNativeSplash\("apiDone"\)|tryDismissNativeSplash\("reactMounted"\)/.test(
    bootMetrics
  )
) {
  fail(
    "splash dismiss must only use shellReady (or auth_shell_fallback/error_boundary), not homeVisible/apiDone/reactMounted"
  );
}

if (
  /minimumSplashDuration|setTimeout\s*\([^)]*hide|setTimeout\s*\([^)]*Splash|setTimeout\s*\([^)]*splash/.test(
    bootMetrics
  )
) {
  fail("dibay-boot-metrics must not use setTimeout/minimumSplashDuration to keep or hide splash");
}

if (!bootMetrics.includes("markAppReady") || !bootMetrics.includes("hideColdBootIntroDom")) {
  fail("dibay-boot-metrics must markAppReady and hide cold-boot intro DOM");
}

const layout = read("app/layout.tsx");
if (!layout.includes("DIBAY_COLD_BOOT_INTRO_DOM_ID") || !layout.includes("DibayColdBootIntroController")) {
  fail("root layout must mount first-HTML cold boot intro + controller");
}
if (!layout.includes("DIBAY") || !/dibay-cold-boot-spinner|dibay-cold-boot-logo/.test(layout)) {
  fail("root layout cold intro must include DIBAY mark and spinner/logo");
}
if (!layout.includes("COLD_BOOT_INTRO_LOCAL_STORAGE_KEY") || !layout.includes("dibay-cold-boot-subtitle")) {
  fail("root layout must apply localStorage cache + subtitle node for seasonal copy");
}

const introCtrl = read("components/app/DibayColdBootIntro.tsx");
if (
  /\bsetTimeout\s*\(|minimumSplashDuration|router\.refresh|location\.reload|\buseState\s*\(/.test(
    introCtrl
  )
) {
  fail("DibayColdBootIntro must not use setTimeout/min duration/reload/local state sync");
}
if (!introCtrl.includes("markAppReady") || !introCtrl.includes("subscribeAppReady")) {
  fail("DibayColdBootIntro must hide via markAppReady/subscribeAppReady");
}
if (!introCtrl.includes("scheduleColdBootIntroConfigRefresh")) {
  fail("DibayColdBootIntro must schedule non-blocking config refresh");
}

const mainActivity = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
if (!mainActivity.includes("installSplashScreen") || !mainActivity.includes("DibayBootBridge")) {
  fail("MainActivity must keep SplashScreen until JS dismiss and expose DibayBootBridge");
}
if (!mainActivity.includes("#FFFCFC")) {
  fail("MainActivity WebView background must match app cream #FFFCFC");
}
if (/SPLASH_MAX_KEEP_MS|native_fallback_elapsed_ms/.test(mainActivity)) {
  fail("MainActivity must not use timed splash dismiss (3/5/8s) — App Ready only");
}
if (!/setKeepOnScreenCondition\(\(\) -> !webSplashDismissRequested\)/.test(mainActivity)) {
  fail("MainActivity keepOnScreenCondition must be App Ready (webSplashDismissRequested) only");
}

const introConfig = read("lib/app-boot/cold-boot-intro-config.ts");
if (!introConfig.includes("DEFAULT_COLD_BOOT_INTRO_CONFIG") || !introConfig.includes("cold_boot_intro_v1")) {
  fail("cold-boot-intro-config must export DEFAULT + settings key");
}

const introClient = read("lib/app-boot/cold-boot-intro-client.ts");
if (!introClient.includes("scheduleColdBootIntroConfigRefresh") || !introClient.includes("localStorage")) {
  fail("cold-boot-intro-client must cache-first + async refresh");
}

if (!fs.existsSync(path.join(ROOT, "app/api/app/cold-boot-intro/route.ts"))) {
  fail("public GET /api/app/cold-boot-intro must exist");
}
if (!fs.existsSync(path.join(ROOT, "app/api/admin/cold-boot-intro/route.ts"))) {
  fail("admin cold-boot-intro API must exist");
}
if (!fs.existsSync(path.join(ROOT, "app/admin/settings/cold-boot-intro/page.tsx"))) {
  fail("admin cold-boot-intro settings page must exist");
}

const stylesXml = read("android/app/src/main/res/values/styles.xml");
if (!stylesXml.includes("windowSplashScreenAnimatedIcon") || !stylesXml.includes("ic_dibay_splash_logo")) {
  fail("Android SplashScreen theme must use cream bg + DIBAY splash logo icon");
}

const capConfig = read("capacitor.config.ts");
if (!capConfig.includes('backgroundColor: "#FFFCFC"')) {
  fail('capacitor SplashScreen backgroundColor must be "#FFFCFC"');
}

const shell = read("components/layout/ConditionalAppShell.tsx");
if (!shell.includes("markBootMetricsShellReady")) {
  fail("ConditionalAppShell must call markBootMetricsShellReady");
}

const feedCache = read("lib/community/philife-feed-session-cache.ts");
if (!feedCache.includes("localStorage") || !feedCache.includes("philife_neighborhood_feed_v3_persistent")) {
  fail("philife feed cache must use persistent localStorage v3");
}
if (
  !feedCache.includes("clearAllPhilifeFeedPersistentCaches") ||
  !feedCache.includes("resolvePhilifeColdBootViewerSig")
) {
  fail("philife feed cache must export clearAll + cold boot viewer sig");
}
if (/sessionStorage\.setItem\(STORAGE_KEY/.test(feedCache)) {
  fail("primary feed cache write must not use sessionStorage");
}

const wipe = read("lib/auth/client-session-wipe.ts");
if (!wipe.includes("clearAllPhilifeFeedPersistentCaches")) {
  fail("client-session-wipe must clear philife persistent feed caches on logout/switch");
}

const communityFeed = read("components/community/CommunityFeed.tsx");
if (
  communityFeed.includes("<CommunityFeedSkeleton") ||
  communityFeed.includes("CommunityFeedPendingBlank") ||
  communityFeed.includes("data-community-feed-cache-wait")
) {
  fail("CommunityFeed must not render skeleton/pending blank/cache-wait on cold boot");
}
if (!communityFeed.includes("patchNeighborhoodFeedRows")) {
  fail("CommunityFeed must patch rows (patchNeighborhoodFeedRows), not blind full replace");
}

if (failed) process.exit(1);
console.log("verify-cold-boot-shell-cache-first: ok");
