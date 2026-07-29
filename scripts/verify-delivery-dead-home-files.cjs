#!/usr/bin/env node
/**
 * Delivery home — dead/orphan surfaces must stay deleted.
 * Live SSOT: StoresHub → StoresHomeHub (app/(main)/stores/page.tsx).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
let failed = false;

function fail(msg) {
  failed = true;
  console.error(`verify:delivery-dead-home-files: ${msg}`);
}

const DEAD = [
  "components/stores/home/StoreNearbyFeedSection.tsx",
  "components/stores/home/hub/StoresHomeSkeleton.tsx",
  "components/stores/home/StorePromoHeroBanner.tsx",
  "components/stores/home/StoreHubMyZoneSection.tsx",
  "components/stores/home/StoreHorizontalRail.tsx",
  "components/stores/home/StoreCategoryExploreSection.tsx",
  "components/stores/home/StoreCategoryTabBar.tsx",
  "components/stores/home/StorePrimaryIndustrySwitcher.tsx",
  "components/stores/home/hub/StoresHomeBuyerMyZone.tsx",
];

const BANNED_SYMBOLS = [
  "StoreNearbyFeedSection",
  "StoresHomeSkeleton",
  "StorePromoHeroBanner",
  "StoreHubMyZoneSection",
  "StoreHorizontalRail",
  "StoreCategoryExploreSection",
  "StoreCategoryTabBar",
  "StorePrimaryIndustrySwitcher",
  "StoresHomeBuyerMyZone",
];

for (const rel of DEAD) {
  if (fs.existsSync(path.join(root, rel))) {
    fail(`dead file still exists: ${rel}`);
  }
}

const livePage = fs.readFileSync(path.join(root, "app/(main)/stores/page.tsx"), "utf8");
if (!livePage.includes("StoresHub")) {
  fail("live /stores page must mount StoresHub");
}
if (livePage.includes("StoreNearbyFeedSection")) {
  fail("live /stores page must not reference StoreNearbyFeedSection");
}

const liveHub = fs.readFileSync(path.join(root, "components/stores/StoresHub.tsx"), "utf8");
if (!liveHub.includes("StoresHomeHub")) {
  fail("StoresHub must mount StoresHomeHub as feed SSOT");
}
for (const sym of BANNED_SYMBOLS) {
  if (liveHub.includes(sym)) {
    fail(`StoresHub must not reference banned symbol ${sym}`);
  }
}

const homeHub = fs.readFileSync(
  path.join(root, "components/stores/home/hub/StoresHomeHub.tsx"),
  "utf8"
);
for (const sym of BANNED_SYMBOLS) {
  if (homeHub.includes(sym)) {
    fail(`StoresHomeHub must not reference banned symbol ${sym}`);
  }
}

/** Product/code import ban (docs + this verify + changelog excluded). */
const walkRoots = ["app", "components", "lib", "hooks"];
const skipDir = new Set(["node_modules", ".next", ".worktrees", ".qa-logs", "dist"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDir.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const files = walkRoots.flatMap((r) => walk(path.join(root, r)));
for (const abs of files) {
  const rel = path.relative(root, abs).replace(/\\/g, "/");
  if (rel.startsWith("scripts/verify-")) continue;
  if (rel.includes("__tests__") || rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
  const src = fs.readFileSync(abs, "utf8");
  for (const sym of BANNED_SYMBOLS) {
    // allow historical mention only in comments that name the live replacement — still ban imports
    if (
      new RegExp(
        String.raw`from\s+["'][^"']*${sym}["']|import\s*\(\s*["'][^"']*${sym}`
      ).test(src)
    ) {
      fail(`import ban: ${rel} imports ${sym}`);
    }
    if (new RegExp(String.raw`<${sym}\b`).test(src)) {
      fail(`JSX ban: ${rel} renders <${sym}`);
    }
  }
}

if (failed) process.exit(1);
console.log(
  "verify:delivery-dead-home-files: ok — orphan home surfaces absent; live SSOT StoresHomeHub"
);
