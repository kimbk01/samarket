/**
 * No dual Feed/List roots from transition enter panels.
 * Hub Surfaces live on route pages only.
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
const code = transition.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
if (
  /\bPhilifeFeedClientEntry\b/.test(code) ||
  /\bHomeProductList\b/.test(code) ||
  /\bStoresHub\b/.test(code) ||
  /\bCommunityMessengerHome\b/.test(code) ||
  /\bMyContent\b/.test(code) ||
  /\bMainTabSurfaceKeepAlive\b/.test(code)
) {
  fail("transition must not render hub Feed/List entries (dual authority)");
}

if (/\bTradeMarketTabPushEnterPanel\b/.test(code) || /\bfunction\s+InstantMainTabEnterPanel\b/.test(transition)) {
  fail("Instant/Trade enter panels must not be wired from MainShellTabContentTransition");
}

if (fs.existsSync(path.join(ROOT, "components/layout/MainTabSurfaceKeepAlive.tsx"))) {
  fail("MainTabSurfaceKeepAlive.tsx must be removed (caused inactive-hub URL hijack)");
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
    fail(`${rel} must declare CommunityHomeSurface for Cold SSR`);
  }
}

if (failed) process.exit(1);
console.log("verify:no-main-tab-dual-feed: ok");
