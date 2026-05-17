#!/usr/bin/env node
/**
 * R2-M1 — 홈 room list 직접 mutate 금지 (applyHomeListPatch 단일 진입).
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const WATCH_FILES = [
  "components/community-messenger/CommunityMessengerHome.tsx",
  "lib/community-messenger/home/use-community-messenger-home-bootstrap.ts",
  "lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts",
  "lib/community-messenger/use-trade-chat-list-meta-hydration.ts",
  "lib/community-messenger/home/use-community-messenger-trade-post-listing-realtime.ts",
];

const FORBIDDEN = [
  { re: /\bmergeBootstrapRoomSummaryIntoLists\s*\(/, label: "mergeBootstrapRoomSummaryIntoLists()" },
  { re: /\bpatchBootstrapRoomListFor(?:RealtimeMessageInsert|SenderLocalEcho)\s*\(/, label: "patchBootstrapRoomList*()" },
  { re: /\bmergeCriticalRoomPatchesIntoLists\s*\(/, label: "mergeCriticalRoomPatchesIntoLists()" },
  { re: /setData\s*\(\s*\(\s*prev\s*\)\s*=>\s*\{[\s\S]{0,400}?prev\.chats\s*\.map\s*\(/, label: "setData prev.chats.map" },
  { re: /setData\s*\(\s*\(\s*prev\s*\)\s*=>\s*\{[\s\S]{0,400}?prev\.groups\s*\.map\s*\(/, label: "setData prev.groups.map" },
  { re: /setData\s*\(\s*\(\s*prev\s*\)\s*=>\s*\{[\s\S]{0,400}?chats:\s*apply\s*\(/, label: "setData chats: apply(...)" },
];

let failed = false;

for (const rel of WATCH_FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[verify-messenger-home-list-owner] missing file: ${rel}`);
    failed = true;
    continue;
  }
  const text = fs.readFileSync(abs, "utf8");
  for (const rule of FORBIDDEN) {
    if (rule.re.test(text)) {
      console.error(`[verify-messenger-home-list-owner] FAIL ${rel}: ${rule.label}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("[verify-messenger-home-list-owner] OK — watched files use applyHomeListPatch only");
