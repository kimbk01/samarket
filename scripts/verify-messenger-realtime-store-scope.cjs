#!/usr/bin/env node
/**
 * R2-M2/M3 — messenger-realtime-store must not own home list rows.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const STORE = path.join(ROOT, "lib/community-messenger/stores/messenger-realtime-store.ts");

if (!fs.existsSync(STORE)) {
  console.error("[verify-messenger-realtime-store-scope] missing store file");
  process.exit(1);
}

const text = fs.readFileSync(STORE, "utf8");

const FORBIDDEN_IN_STORE = [
  "roomSummariesById",
  "unreadByRoomId",
  "roomOrder",
  "totalUnread",
  "EMPTY_HUB_LIST_MAPS",
  "applyRoomSummaryPatched",
  "applyRoomReadEvent",
  "getMessengerRealtimeRoomSummary",
  "seedBootstrap",
  "applyCommunityMessengerUnreadOptimistic",
  "recomputeTotalUnread",
  "sortRoomOrder",
  "feedOrderKey",
  "patchSummaryFromPreview",
];

let failed = false;
for (const token of FORBIDDEN_IN_STORE) {
  if (text.includes(token)) {
    console.error(`[verify-messenger-realtime-store-scope] FAIL: forbidden token in store: ${token}`);
    failed = true;
  }
}

const required = ["wroteHomeListBlocked", "cmRtStoreScopeLog", "messagesByRoomId"];
for (const token of required) {
  if (!text.includes(token)) {
    console.error(`[verify-messenger-realtime-store-scope] FAIL: missing ${token}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("[verify-messenger-realtime-store-scope] OK — hub list fields and writers removed from realtime store");
