#!/usr/bin/env node
/** Warm tab transitions must not show skeleton/blank blocking shells. */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
let failed = false;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fail(msg) {
  failed = true;
  console.error(`verify:no-tab-skeleton-blocking: ${msg}`);
}

const transition = read("components/layout/MainShellTabContentTransition.tsx");
if (transition.includes("MainFeedRouteLoading") || transition.includes("CommunityFeedSkeleton")) {
  fail("MainShellTabContentTransition must not import skeleton shells");
}
if (transition.includes("pendingShell = null") === false && !transition.includes("const pendingShell = null")) {
  fail("pendingShell must be null");
}
if (/\bsetTimeout\s*\(/.test(transition)) {
  fail("tab enter must not use setTimeout defer (empty shell flash)");
}

const pages = [
  "app/(main)/philife/page.tsx",
  "app/(main)/market/page.tsx",
  "app/(main)/stores/page.tsx",
  "app/(main)/mypage/page.tsx",
];
for (const rel of pages) {
  const src = read(rel);
  if (/<(MainFeedRouteLoading|CommunityFeedSkeleton)\b/.test(src)) {
    fail(`${rel} must not use feed skeleton for tab root`);
  }
}

if (failed) process.exit(1);
console.log("verify:no-tab-skeleton-blocking: ok");
