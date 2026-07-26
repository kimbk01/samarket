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
    "splash dismiss must only use shellReady (or auth_shell_fallback), not homeVisible/apiDone/reactMounted"
  );
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
