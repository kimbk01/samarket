#!/usr/bin/env node
/** Cache/network must patch rows — not rebuild from [] then replace. */
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const feed = fs.readFileSync(path.join(ROOT, "components/community/CommunityFeed.tsx"), "utf8");
if (/mergeNeighborhoodFeedById\(\s*\[\s*\]\s*,\s*next/.test(feed)) {
  console.error(
    "verify:no-cache-network-full-replace: network !append must not merge from [] before patch"
  );
  process.exit(1);
}
if (!feed.includes("patchNeighborhoodFeedRows(prev, next)")) {
  console.error("verify:no-cache-network-full-replace: expected patchNeighborhoodFeedRows(prev, next)");
  process.exit(1);
}
console.log("verify:no-cache-network-full-replace: ok");
