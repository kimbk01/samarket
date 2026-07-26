#!/usr/bin/env node
/**
 * First HTML App Shell — Community scope + exploration header must not be
 * client-only deferred (ssr:false), and scope must live on server Surface.
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
  console.error(`verify:first-html-app-shell: ${msg}`);
}

const surface = read("components/community/CommunityHomeSurface.tsx");
if (!surface.includes("CommunityUiScope") || !surface.includes("PhilifeFeedClientEntry")) {
  fail("CommunityHomeSurface must own CommunityUiScope around PhilifeFeedClientEntry");
}

const entry = read("components/community/PhilifeFeedClientEntry.tsx");
const entryCode = entry.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
if (entryCode.includes("CommunityUiScope")) {
  fail("PhilifeFeedClientEntry must not own CommunityUiScope (First HTML = server Surface)");
}

const scope = read("components/community/CommunityUiScope.tsx");
if (!scope.includes('data-dibay-first-html-shell="1"') || !scope.includes("data-community-ui")) {
  fail("CommunityUiScope must expose first-html-shell + data-community-ui markers");
}

const regionBar = read("components/layout/RegionBar.tsx");
if (/RegionBarExplorationTier1Lazy|dynamic\([\s\S]*RegionBarExplorationTier1[\s\S]*ssr:\s*false/.test(regionBar)) {
  fail("RegionBar must not dynamic-import ExplorationTier1 with ssr:false");
}
if (!regionBar.includes('import { RegionBarExplorationTier1 }')) {
  fail("RegionBar must statically import RegionBarExplorationTier1 for SSR");
}

if (failed) process.exit(1);
console.log("verify:first-html-app-shell: ok");
