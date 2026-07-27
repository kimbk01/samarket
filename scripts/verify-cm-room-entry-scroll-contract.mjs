#!/usr/bin/env node
/**
 * CM Room Entry Scroll contract — single initial anchor, no paint-then-correct.
 * 정본: docs/chat-thread-scroll-contract.md
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

const controller = read("lib/community-messenger/room/messenger-room-scroll-anchor-controller.ts");
const reader = read("lib/community-messenger/room/use-messenger-room-reader-scroll-bottom.ts");
const phase1 = read("lib/community-messenger/room/use-messenger-room-client-phase1.ts");
const groupChat = read("components/group-chat/GroupChatRoomClient.tsx");
const contractDoc = read("docs/chat-thread-scroll-contract.md");
const engine = read("lib/chat-thread-scroll/engine.ts");
const entryReady = read("lib/community-messenger/room/messenger-room-entry-scroll-ready.ts");
const layoutMode = read("lib/community-messenger/room/messenger-timeline-layout-mode.ts");

assertIncludes(controller, "createChatThreadScrollEngine", "scroll-anchor-controller");
assertIncludes(controller, "tryCompleteEntry", "scroll-anchor-controller");
assertIncludes(controller, "loadingOlderMessages", "scroll-anchor-controller prepend guard");
assertIncludes(controller, "hasAppliedInitialAnchorRef", "scroll-anchor-controller single initial");
assertIncludes(controller, "flushInitialEntryAnchor", "scroll-anchor-controller sync flush");
assertIncludes(controller, "syncStickToBottom", "scroll-anchor-controller stick sync");
assertIncludes(engine, "syncStickToBottom", "chat-thread-scroll engine stick sync");
assertIncludes(engine, "preserveVisibleAnchor", "chat-thread-scroll engine visible anchor");
assertExcludes(controller, "resolveMessengerRoomEntryScrollFinalize", "scroll-anchor-controller legacy gate");
assertExcludes(controller, ".scrollTop =", "scroll-anchor-controller inline scroll");
assertExcludes(controller, "schedulePendingEntryTailSettle", "scroll-anchor-controller no tail settle");
assertExcludes(controller, "requestAnimationFrame(() => {\n          entryRetryRafRef", "scroll-anchor-controller no nested entry rAF");
assertExcludes(controller, "roomMessagesFingerprint", "scroll-anchor-controller no fingerprint settle");

assertIncludes(reader, "useMessengerRoomScrollAnchorController", "reader-scroll-bottom");
assertIncludes(phase1, "loadingOlderMessages,", "phase1 scroll wiring");
assertIncludes(phase1, "lastReadMessageId:", "phase1 last-read entry");

assertIncludes(groupChat, "useChatThreadScroll", "GroupChatRoomClient");
assertExcludes(groupChat, "runChatThreadEntryScrollToBottom", "GroupChatRoomClient legacy entry");

assertIncludes(contractDoc, "CHAT_THREAD_STICK_THRESHOLD_PX", "contract doc");
assertIncludes(contractDoc, "initial anchor once", "contract doc single initial");
assertIncludes(controller, "resolveMessengerRoomEntryScrollPaintReady", "scroll-anchor-controller paint gate");
assertIncludes(engine, "resolveEntryPaintReady", "chat-thread-scroll engine paint hook");

assertExcludes(entryReady, "isMessengerRoomComposerHeightSynced(vp)", "entry-scroll-ready no composer gate");
assertExcludes(layoutMode, "maxAttempts", "timeline-layout-mode no rAF retry loop");

if (!existsSync(join(root, "lib/chat-thread-scroll/__tests__/engine.test.ts"))) {
  errors.push("missing lib/chat-thread-scroll/__tests__/engine.test.ts");
}

if (errors.length > 0) {
  console.error("verify:cm-room-entry-scroll-contract FAIL\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("verify:cm-room-entry-scroll-contract PASS (single initial anchor SSOT)");
