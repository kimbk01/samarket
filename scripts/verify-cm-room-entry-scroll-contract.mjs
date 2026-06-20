#!/usr/bin/env node
/**
 * CM Room Entry Scroll contract — Layout Settle Gate 회귀 탐지.
 * 정본: docs/community-messenger-room-entry-scroll-contract.md
 *
 * 사용: npm run verify:cm-room-entry-scroll-contract
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function assertIncludes(source, needle, context) {
  if (!source.includes(needle)) errors.push(`${context}: missing "${needle}"`);
}

const settle = read("lib/community-messenger/room/messenger-room-entry-scroll-settle.ts");
const owner = read("lib/community-messenger/room/messenger-room-entry-scroll-owner.ts");
const controller = read("lib/community-messenger/room/messenger-room-scroll-anchor-controller.ts");
const reader = read("lib/community-messenger/room/use-messenger-room-reader-scroll-bottom.ts");
const phase1 = read("lib/community-messenger/room/use-messenger-room-client-phase1.ts");
const groupChat = read("components/group-chat/GroupChatRoomClient.tsx");
const contractDoc = read("docs/community-messenger-room-entry-scroll-contract.md");

assertIncludes(settle, "resolveMessengerRoomEntryScrollFinalize", "entry-scroll-settle");
assertIncludes(settle, "markEntrySettled: false", "entry-scroll-settle defer");
assertIncludes(settle, "isMessengerEntryTailSettleReason", "entry-scroll-settle terminal");

assertIncludes(owner, "entryInitialScrollDone", "entry-scroll-owner");
assertIncludes(owner, "markMessengerRoomEntryInitialScrollDone", "entry-scroll-owner");
assertIncludes(owner, "push_entry_tail_settle", "entry-scroll-owner tail gate");
assertIncludes(owner, "entryScrollSettled", "entry-scroll-owner chrome gate");

assertIncludes(controller, "resolveMessengerRoomEntryScrollFinalize", "scroll-anchor-controller");
assertIncludes(controller, "applyEntryScrollPhaseFinalize", "scroll-anchor-controller");
assertIncludes(controller, "loadingOlderMessages", "scroll-anchor-controller prepend guard");
assertIncludes(controller, "isMessengerRoomEntryInitialScrollDone", "scroll-anchor-controller tail gate");

assertIncludes(reader, "loadingOlderMessages", "reader-scroll-bottom");
assertIncludes(phase1, "loadingOlderMessages,", "phase1 scroll wiring");

assertIncludes(groupChat, "runChatThreadEntryScrollToBottom", "GroupChatRoomClient");

assertIncludes(contractDoc, "Layout Settle Gate", "contract doc");

if (!existsSync(join(root, "lib/community-messenger/room/__tests__/messenger-room-entry-scroll-settle.test.ts"))) {
  errors.push("missing messenger-room-entry-scroll-settle.test.ts");
}

if (errors.length > 0) {
  console.error("verify:cm-room-entry-scroll-contract FAIL\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("verify:cm-room-entry-scroll-contract PASS");
