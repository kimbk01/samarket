#!/usr/bin/env node
/**
 * CM Room Entry Scroll contract — useChatThreadScroll + latest-bottom entry.
 * 정본: docs/chat-thread-scroll-contract.md · docs/cm-room-telegram-kakao-parity-redesign.md
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

function assertExcludes(source, needle, context) {
  if (source.includes(needle)) errors.push(`${context}: must not include "${needle}"`);
}

const phase1 = read("lib/community-messenger/room/use-messenger-room-client-phase1.ts");
const hook = read("lib/chat-thread-scroll/use-chat-thread-scroll.ts");
const entryIntent = read("lib/community-messenger/room/messenger-room-entry-intent.ts");
const groupChat = read("components/group-chat/GroupChatRoomClient.tsx");
const contractDoc = read("docs/chat-thread-scroll-contract.md");
const engine = read("lib/chat-thread-scroll/engine.ts");
const entryReady = read("lib/community-messenger/room/messenger-room-entry-scroll-ready.ts");
const layoutMode = read("lib/community-messenger/room/messenger-timeline-layout-mode.ts");
const mutation = read("lib/community-messenger/room/messenger-room-messages-mutation.ts");

assertIncludes(phase1, "useChatThreadScroll", "phase1 scroll wiring");
assertIncludes(phase1, "entryForceBottom: true", "phase1 always latest bottom");
assertIncludes(phase1, "CM_ROOM_CHROME_HEIGHT_SYNC_EVENT", "phase1 chrome layout commit");
assertIncludes(phase1, "applyRoomMessagesMutation", "phase1 mutation bus");
assertExcludes(phase1, "useMessengerRoomReaderScrollBottom", "phase1 no legacy reader scroll");
assertExcludes(phase1, "useMessengerRoomScrollAnchorController", "phase1 no scroll-anchor-controller");

assertIncludes(hook, "layoutCommittedEventName", "useChatThreadScroll");
assertIncludes(hook, "entryForceBottom", "useChatThreadScroll");

assertIncludes(entryIntent, "forceBottom: true", "entry-intent always bottom");
assertExcludes(entryIntent, 'reason: "room_entry_restore"', "entry-intent no restore plan");

assertIncludes(mutation, 'kind: RoomMessagesMutationKind', "mutation bus kinds");
assertIncludes(mutation, "notifyPrependComplete", "mutation prepend bridge");

assertIncludes(groupChat, "useChatThreadScroll", "GroupChatRoomClient");
assertExcludes(groupChat, "runChatThreadEntryScrollToBottom", "GroupChatRoomClient legacy entry");

assertIncludes(contractDoc, "CHAT_THREAD_STICK_THRESHOLD_PX", "contract doc");
assertIncludes(contractDoc, "항상 latest bottom", "contract doc entry policy");
assertIncludes(engine, "resolveEntryPaintReady", "chat-thread-scroll engine paint hook");

assertExcludes(entryReady, "isMessengerRoomComposerHeightSynced(vp)", "entry-scroll-ready no composer gate");
assertExcludes(layoutMode, "maxAttempts", "timeline-layout-mode no rAF retry loop");

if (!existsSync(join(root, "lib/chat-thread-scroll/__tests__/engine.test.ts"))) {
  errors.push("missing lib/chat-thread-scroll/__tests__/engine.test.ts");
}
if (!existsSync(join(root, "docs/cm-room-telegram-kakao-parity-redesign.md"))) {
  errors.push("missing docs/cm-room-telegram-kakao-parity-redesign.md");
}

if (errors.length > 0) {
  console.error("verify:cm-room-entry-scroll-contract FAIL\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("verify:cm-room-entry-scroll-contract PASS (useChatThreadScroll + latest-bottom SSOT)");
