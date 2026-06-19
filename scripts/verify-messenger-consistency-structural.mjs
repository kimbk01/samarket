#!/usr/bin/env node
/**
 * MRC1 structural verify — consistency modules wired, no legacy regression.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fails = [];
const passes = [];

function mustExist(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) fails.push(`missing file: ${rel}`);
  else passes.push(`exists: ${rel}`);
}

function mustInclude(rel, needle) {
  const full = path.join(root, rel);
  const text = fs.readFileSync(full, "utf8");
  if (!text.includes(needle)) fails.push(`${rel} missing: ${needle}`);
  else passes.push(`${rel} includes ${needle}`);
}

console.log("\n=== Messenger Realtime Consistency (MRC1) Structural Verify ===\n");

mustExist("lib/community-messenger/consistency/messenger-consistency-version.ts");
mustExist("lib/community-messenger/consistency/messenger-consistency-merge.ts");
mustExist("lib/community-messenger/consistency/messenger-consistency-analysis.ts");
mustExist("lib/community-messenger/consistency/messenger-consistency-regression-guard.ts");
mustExist("lib/community-messenger/consistency/messenger-consistency-cross-tab.ts");
mustExist("docs/perf/messenger-realtime-consistency-lock.md");

mustInclude(
  "lib/community-messenger/merge-critical-home-sync-room-summary.ts",
  "coalesceRoomSummarySnapshotRow"
);
mustInclude(
  "lib/community-messenger/home-list-patch.ts",
  "mergeRoomListsWithVersionGuard"
);
mustInclude(
  "lib/community-messenger/home-list-patch.ts",
  "mergeCallHistoryLists"
);
mustInclude(
  "lib/community-messenger/home-list-patch.ts",
  "coalesceRoomSummarySnapshotRow"
);
mustInclude(
  "lib/community-messenger/room/merge-community-messenger-silent-delta.ts",
  "coalesceRoomSummarySnapshotRow"
);
mustInclude(
  "lib/community-messenger/home/merge-bootstrap-room-summary-into-lists.ts",
  "coalesceRoomSummarySnapshotRow"
);
mustInclude(
  "lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts",
  "wireMessengerConsistencyCrossTabHandlers"
);
mustInclude(
  "lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts",
  "broadcastMessengerReconnectPreserveCrossTab"
);
mustInclude(
  "lib/community-messenger/consistency/messenger-consistency-analysis.ts",
  "[messenger-consistency-analysis]"
);
mustInclude(
  "lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message.ts",
  "bumpRoomTruthVersion"
);
mustInclude(
  "lib/community-messenger/consistency/messenger-consistency-regression-guard.ts",
  "[messenger-consistency-regression-alert]"
);

console.log("--- PASS ---");
passes.forEach((p) => console.log(" ✓", p));
if (fails.length) {
  console.log("\n--- FAIL ---");
  fails.forEach((f) => console.log(" ✗", f));
  process.exit(1);
}
console.log("\nVERDICT: PASS (MRC1 structural wiring)\n");
