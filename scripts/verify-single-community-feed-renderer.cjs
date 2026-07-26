#!/usr/bin/env node
/**
 * Single Community Feed Renderer — Cold `/` and tab `/philife` must share the
 * same token scope + card class (attachment 2). Attachment 1 = CM_* cards
 * painted outside `[data-community-ui]` (invalid --cm-radius-card → sharp).
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
  console.error(`verify:single-community-feed-renderer: ${msg}`);
}

const entry = read("components/community/PhilifeFeedClientEntry.tsx");
if (!entry.includes("CommunityUiScope")) {
  fail("PhilifeFeedClientEntry must wrap feed in CommunityUiScope (Cold `/` token scope)");
}

const scope = read("components/community/CommunityUiScope.tsx");
if (!scope.includes("data-community-ui") || !scope.includes('data-community-renderer={COMMUNITY_RENDERER_ID}')) {
  fail("CommunityUiScope must set data-community-ui + canonical renderer marker");
}
if (!scope.includes("CM_PAGE_CLASS")) {
  fail("CommunityUiScope must apply CM_PAGE_CLASS");
}

const surface = read("components/community/CommunityHomeSurface.tsx");
if (!surface.includes("PhilifeFeedClientEntry")) {
  fail("CommunityHomeSurface must mount PhilifeFeedClientEntry only");
}
if (/^\s*(?!\/\/|\*|\/\*).*(?:posts\.map|CommunityCard|CM_FEED_CARD)/m.test(surface.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))) {
  fail("CommunityHomeSurface must not map posts / compose cards directly");
}

const layouts = read("components/community/feed-list-layouts.tsx");
if (!layouts.includes("CM_FEED_CARD_CLASS")) {
  fail("feed-list-layouts CardShell must use CM_FEED_CARD_CLASS");
}
if (!layouts.includes('data-community-renderer="canonical-v1"')) {
  fail("CardShell must mark canonical-v1 renderer");
}
if (/PHILIFE_FB_CARD_CLASS|sam-card/.test(layouts)) {
  fail("feed-list-layouts must not use legacy sam-card / PHILIFE_FB_CARD_CLASS for post cards");
}

const classes = read("lib/community/community-ui-classes.ts");
if (!classes.includes("rounded-[var(--cm-radius-card)]")) {
  fail("CM_CARD_CLASS must use --cm-radius-card (canonical rounded card)");
}

const tokens = read("lib/community/community-design-tokens.css");
if (!tokens.includes("[data-community-ui]") || !tokens.includes("--cm-radius-card: 22px")) {
  fail("community-design-tokens must define --cm-radius-card under [data-community-ui]");
}

const feed = read("components/community/CommunityFeed.tsx");
if (!feed.includes("CommunityCard") || !feed.includes("COMMUNITY_FEED_LIST_WRAP_CLASS")) {
  fail("CommunityFeed must use CommunityCard + COMMUNITY_FEED_LIST_WRAP_CLASS");
}
if (/PHILIFE_FEED_LIST_WRAP_CLASS/.test(feed)) {
  fail("CommunityFeed must not use tight legacy PHILIFE_FEED_LIST_WRAP_CLASS");
}
if (!feed.includes('data-community-renderer="canonical-v1"')) {
  fail("CommunityFeed root must mark canonical-v1");
}
if (/isCold|isWarm|cacheOnly|legacyCard|borderedCard|cardVariant/.test(feed)) {
  fail("CommunityFeed must not branch card chrome on cold/warm/cache/legacy variants");
}

for (const rel of [
  "app/(main)/philife/layout.tsx",
  "app/(main)/community/layout.tsx",
]) {
  const src = read(rel);
  if (!src.includes("CommunityUiScope")) {
    fail(`${rel} must use CommunityUiScope (not shell-only without tokens)`);
  }
  if (/data-community-ui/.test(src) && !src.includes("CommunityUiScope")) {
    fail(`${rel} must not inline data-community-ui outside CommunityUiScope`);
  }
}

const tabEnter = read("components/layout/MainShellTabContentTransition.tsx");
if (!tabEnter.includes("PhilifeFeedClientEntry")) {
  fail("InstantMainTabEnterPanel must use PhilifeFeedClientEntry for community");
}
if (/pathname === "\/philife"[\s\S]{0,200}bg-sam-app/.test(tabEnter)) {
  fail("community tab-enter panel must not paint bg-sam-app outside CommunityUiScope");
}

const writeForm = read("components/write/community/CommunityWriteForm.tsx");
if (writeForm.includes("data-community-ui") && !writeForm.includes("CommunityUiScope")) {
  /* write form may keep local scope — OK */
}

if (failed) process.exit(1);
console.log("verify:single-community-feed-renderer: ok");
