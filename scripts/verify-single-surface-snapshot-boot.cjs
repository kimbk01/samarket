#!/usr/bin/env node
/** Cold + Warm share resolveInitialCommunityFeedSnapshot. */
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
let failed = false;
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function fail(msg) {
  failed = true;
  console.error(`verify:single-surface-snapshot-boot: ${msg}`);
}

const resolver = read("lib/community/resolve-initial-community-feed-snapshot.ts");
if (!resolver.includes("export function resolveInitialCommunityFeedSnapshot")) {
  fail("missing resolveInitialCommunityFeedSnapshot");
}

const entry = read("components/community/PhilifeFeedClientEntry.tsx");
if (!entry.includes("resolveInitialCommunityFeedSnapshot")) {
  fail("PhilifeFeedClientEntry must use resolveInitialCommunityFeedSnapshot");
}
if (/resolvePhilifeTabEnterBootFromSessionCache/.test(entry)) {
  fail("legacy tabEnter-only boot helper must be removed");
}

const feed = read("components/community/CommunityFeed.tsx");
if (!feed.includes("resolveInitialCommunityFeedSnapshot")) {
  fail("CommunityFeed must use resolveInitialCommunityFeedSnapshot for cold restore");
}

if (failed) process.exit(1);
console.log("verify:single-surface-snapshot-boot: ok");
