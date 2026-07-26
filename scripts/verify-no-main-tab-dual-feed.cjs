/**
 * No dual Feed/List roots — hub Surfaces only under MainTabSurfaceKeepAlive (+ SSR page for cold),
 * not under Instant enter panels.
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
  console.error(`verify:no-main-tab-dual-feed: ${msg}`);
}

const transition = read("components/layout/MainShellTabContentTransition.tsx");
if (
  transition.includes("PhilifeFeedClientEntry") ||
  transition.includes("HomeProductList") ||
  transition.includes("StoresHub") ||
  transition.includes("CommunityMessengerHome") ||
  transition.includes("MyContent")
) {
  fail("transition must not render hub Feed/List entries (dual authority)");
}

const keepAlive = read("components/layout/MainTabSurfaceKeepAlive.tsx");
const required = [
  ["CommunityHomeSurface", "community"],
  ["MarketContent", "trade"],
  ["StoresHub", "delivery"],
  ["MessengerHubRouteGate", "chat"],
  ["MyContent", "mypage"],
];
for (const [sym, hub] of required) {
  if (!keepAlive.includes(sym)) {
    fail(`MainTabSurfaceKeepAlive missing ${hub} Surface (${sym})`);
  }
}

/** Instant enter panel file may exist but must not be wired from transition */
if (/\bTradeMarketTabPushEnterPanel\b/.test(transition) || /\bfunction\s+InstantMainTabEnterPanel\b/.test(transition)) {
  fail("Instant/Trade enter panels must not be wired from MainShellTabContentTransition");
}

const communityPages = [
  "app/(main)/page.tsx",
  "app/(main)/philife/page.tsx",
  "app/(main)/community/page.tsx",
  "app/(main)/home/page.tsx",
];
for (const rel of communityPages) {
  const src = read(rel);
  if (!src.includes("CommunityHomeSurface") && !src.includes("PhilifeHomeFeedPage")) {
    fail(`${rel} must still declare CommunityHomeSurface for Cold SSR`);
  }
}

if (failed) process.exit(1);
console.log("verify:no-main-tab-dual-feed: ok");
