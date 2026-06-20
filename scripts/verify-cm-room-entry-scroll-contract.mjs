#!/usr/bin/env node
/**
 * CM Room Entry Scroll contract — chat-thread-scroll 엔진 위임 회귀 탐지.
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

assertIncludes(controller, "createChatThreadScrollEngine", "scroll-anchor-controller");
assertIncludes(controller, "tryCompleteEntry", "scroll-anchor-controller");
assertIncludes(controller, "loadingOlderMessages", "scroll-anchor-controller prepend guard");
assertExcludes(controller, "resolveMessengerRoomEntryScrollFinalize", "scroll-anchor-controller legacy gate");
assertExcludes(controller, ".scrollTop =", "scroll-anchor-controller inline scroll");

assertIncludes(reader, "useMessengerRoomScrollAnchorController", "reader-scroll-bottom");
assertIncludes(phase1, "loadingOlderMessages,", "phase1 scroll wiring");

assertIncludes(groupChat, "useChatThreadScroll", "GroupChatRoomClient");
assertExcludes(groupChat, "runChatThreadEntryScrollToBottom", "GroupChatRoomClient legacy entry");

assertIncludes(contractDoc, "CHAT_THREAD_STICK_THRESHOLD_PX", "contract doc");
assertIncludes(engine, "entryPendingLayout", "chat-thread-scroll engine");

if (!existsSync(join(root, "lib/chat-thread-scroll/__tests__/engine.test.ts"))) {
  errors.push("missing lib/chat-thread-scroll/__tests__/engine.test.ts");
}

if (errors.length > 0) {
  console.error("verify:cm-room-entry-scroll-contract FAIL\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("verify:cm-room-entry-scroll-contract PASS (delegates to chat-thread-scroll SSOT)");
