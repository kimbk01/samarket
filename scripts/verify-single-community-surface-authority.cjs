#!/usr/bin/env node
/**
 * Single Community Surface Authority — `/` · `/philife` · `/community` share one entry;
 * `/` must never resolve as Trade header/surface.
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
  console.error(`verify:single-community-surface-authority: ${msg}`);
}

const CANONICAL = "CommunityHomeSurface";
for (const rel of [
  "app/(main)/page.tsx",
  "app/(main)/philife/page.tsx",
  "app/(main)/community/page.tsx",
  "app/(main)/home/page.tsx",
]) {
  const src = read(rel);
  if (!src.includes(CANONICAL)) {
    fail(`${rel} must render ${CANONICAL}`);
  }
  if (/redirect\s*\(/.test(src)) {
    fail(`${rel} must not redirect`);
  }
  if (/MarketContent|HomeProductList|TradeHeaderComposeButton|TradePrimaryTabs/.test(src)) {
    fail(`${rel} must not compose Trade UI`);
  }
}

const surface = read("components/community/CommunityHomeSurface.tsx");
if (!surface.includes("PhilifeFeedClientEntry")) {
  fail("CommunityHomeSurface must mount PhilifeFeedClientEntry");
}

const tradeFloat = read("lib/layout/mobile-top-tier1-rules.ts");
if (/normalizeAppPathnameForTier1\(safePath\)\s*===\s*"\/"\s*return true/.test(tradeFloat)) {
  fail("isTradeFloatingMenuSurface must not treat `/` as trade");
}
if (!tradeFloat.includes("DO NOT: `/` 를 trade surface")) {
  fail("isTradeFloatingMenuSurface must document `/` is not trade");
}

const exploration = read("components/layout/RegionBarExplorationTier1.tsx");
if (!exploration.includes('pathNoQuery === "/"') || !exploration.includes('pathNoQuery === "/community"')) {
  fail("RegionBarExplorationTier1 must treat `/` and `/community` as Community home header");
}
if (/isPhilifeFeed\s*=\s*pathNoQuery\s*===\s*"\/philife"\s*;/.test(exploration)) {
  fail("RegionBarExplorationTier1 must not use philife-only title gate (leaves `/` as Trade)");
}

const ssot = read("lib/layout/resolve-main-surface.ts");
if (!ssot.includes('export function resolveMainSurface') || !ssot.includes('"community"')) {
  fail("resolve-main-surface.ts must export resolveMainSurface with community");
}
if (!/p === "\/"[\s\S]*return "community"/.test(ssot) && !ssot.includes('p === "/"')) {
  fail("resolveMainSurface must map `/` to community");
}

const aliases = read("lib/main-menu/canonical-nav-index-resolver.ts");
if (!/community:\s*\[[^\]]*["']\/["']/.test(aliases)) {
  fail("BUILTIN_TAB_PATH_ALIASES.community must include `/`");
}

const tabActive = read("lib/main-menu/main-bottom-nav-prefetch-pick.ts");
if (!tabActive.includes('p === "/"') || !tabActive.includes('h === "/philife"')) {
  fail("isBottomNavTabActive must map `/` to Community tab `/philife`");
}

if (failed) process.exit(1);
console.log("verify:single-community-surface-authority: ok");
