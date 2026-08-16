/**
 * Single main-tab Surface instance — transition layer must not create hub Feed/List entries.
 * Canonical Surfaces come from route pages only (no Instant enter / no multi-hub keep-alive host).
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
  console.error(`verify:single-main-tab-surface-instance: ${msg}`);
}

const transition = read("components/layout/MainShellTabContentTransition.tsx");
const transitionCode = transition.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const banned = [
  "PhilifeFeedClientEntry",
  "CommunityHomeSurface",
  "CommunityUiScope",
  "HomeProductList",
  "MarketContent",
  "StoresHub",
  "CommunityMessengerHome",
  "MessengerHubRouteGate",
  "MyContent",
  "TradeMarketTabPushEnterPanel",
  "MainTabSurfaceKeepAlive",
];
for (const name of banned) {
  if (new RegExp(`\\b${name}\\b`).test(transitionCode)) {
    fail(`MainShellTabContentTransition must not import/render ${name}`);
  }
}
if (/\bfunction\s+InstantMainTabEnterPanel\b/.test(transition)) {
  fail("MainShellTabContentTransition must not define InstantMainTabEnterPanel");
}
if (!/pendingPushNode=\{null\}/.test(transition)) {
  fail("pendingPushNode must be null (no temporary Surface)");
}
if (fs.existsSync(path.join(ROOT, "components/layout/MainTabSurfaceKeepAlive.tsx"))) {
  fail("MainTabSurfaceKeepAlive.tsx must be removed");
}

const appRoute = read("components/route-transition/AppRouteTransition.tsx");
if (!appRoute.includes("shouldArmMainDomainTruePush")) {
  fail("AppRouteTransition must arm MAIN DOMAIN true push via shouldArmMainDomainTruePush");
}
if (!appRoute.includes("data-main-domain-previous") || !appRoute.includes("data-main-domain-current")) {
  fail("AppRouteTransition must expose previous+current domain panels for true push");
}
if (!appRoute.includes("liveChildren")) {
  fail("AppRouteTransition must keep live route children on the current panel (no Instant Feed clone)");
}
if (/MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES\s*=\s*new Set\(\s*\[\s*["']bottom-nav["']/.test(appRoute)) {
  fail("MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES must not include bottom-nav (Instant path); use pathname-owned true push");
}
if (/\bfunction\s+InstantMainTabEnterPanel\b/.test(appRoute)) {
  fail("AppRouteTransition must not define InstantMainTabEnterPanel");
}

const ssot = read("lib/layout/resolve-main-surface.ts");
if (!ssot.includes("resolveMainTabKeepAliveHub") || !ssot.includes("isMainTabKeepAliveHubPath")) {
  fail("resolve-main-surface must export hub helpers");
}
const cross = read("lib/navigation/main-domain-cross-push.ts");
if (!cross.includes("shouldArmMainDomainTruePush") || !cross.includes("isMainDomainCrossPush")) {
  fail("main-domain-cross-push must own MAIN DOMAIN push arm authority");
}

if (failed) process.exit(1);
console.log("verify:single-main-tab-surface-instance: ok");
