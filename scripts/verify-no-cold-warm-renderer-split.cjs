#!/usr/bin/env node
/** Cold/Warm must not use separate feed/card renderers. */
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const entry = fs.readFileSync(
  path.join(ROOT, "components/community/PhilifeFeedClientEntry.tsx"),
  "utf8"
);
const feed = fs.readFileSync(path.join(ROOT, "components/community/CommunityFeed.tsx"), "utf8");
if (/ColdOnly|WarmOnly|LegacyFeed|CachedPostCard/.test(entry + feed)) {
  console.error("verify:no-cold-warm-renderer-split: cold/warm-specific renderer found");
  process.exit(1);
}
if (!entry.includes("resolveInitialCommunityFeedSnapshot")) {
  console.error("verify:no-cold-warm-renderer-split: entry missing shared snapshot resolver");
  process.exit(1);
}
console.log("verify:no-cold-warm-renderer-split: ok");
