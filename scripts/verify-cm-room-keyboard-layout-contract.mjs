#!/usr/bin/env node
/**
 * CM Room Keyboard/Layout LOCK contract — 회귀 탐지.
 * 규칙: docs/community-messenger-mobile-room-viewport.md §0
 *       .cursor/rules/cm-room-keyboard-layout-contract-lock.mdc
 *
 * 사용: npm run verify:cm-room-keyboard-layout-contract
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

function assertNotIncludes(source, needle, context) {
  if (source.includes(needle)) errors.push(`${context}: forbidden "${needle}"`);
}

function assertNotMatches(source, pattern, context) {
  if (pattern.test(source)) errors.push(`${context}: forbidden pattern ${pattern}`);
}

function assertFileMissing(rel, context) {
  if (existsSync(join(root, rel))) errors.push(`${context}: deleted file must stay removed — ${rel}`);
}

const shellCss = read("app/chat-viewport-shell.css");
const body = read("components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx");
const kbOffset = read("lib/ui/use-cm-room-kb-offset.ts");
const viewportShell = read("lib/ui/use-cm-room-visible-viewport-shell.ts");
const viewportContract = read("lib/ui/cm-room-visible-viewport-contract.ts");
const tuning = read("lib/ui/messenger-chat-viewport-tuning.ts");
const scrollAnchor = read("lib/community-messenger/room/messenger-room-scroll-anchor-controller.ts");
const chatHeader = read("components/chat/ChatHeader.tsx");
const chatComposer = read("components/chat/ChatComposer.tsx");
const phase2Composer = read(
  "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx"
);

const cmRoomSources = [
  shellCss,
  body,
  kbOffset,
  viewportShell,
  viewportContract,
  tuning,
  scrollAnchor,
  chatHeader,
  chatComposer,
  phase2Composer,
];

const FORBIDDEN_STRINGS = [
  "--chat-viewport-height",
  "--chat-bottom-inset",
  "keyboardOverlapSuppressed",
  "useChatViewportShellInsets",
  "chat-viewport-shell-platform",
  "useMessengerTradeKeyboardChrome",
  "MessengerRoomMobileViewportProvider",
  "messengerKeyboardChromeOpen",
  "use-chat-viewport-shell-insets",
  "use-messenger-trade-keyboard-chrome",
  "MESSENGER_KEYBOARD",
  "keyboardHysteresis",
  "keyboardDedupe",
];

for (const src of cmRoomSources) {
  const label = "cm-room keyboard lock";
  for (const forbidden of FORBIDDEN_STRINGS) {
    assertNotIncludes(src, forbidden, label);
  }
}

assertFileMissing("lib/ui/use-chat-viewport-shell-insets.ts", "deleted legacy");
assertFileMissing("lib/ui/chat-viewport-shell-platform.ts", "deleted legacy");
assertFileMissing("lib/ui/use-messenger-trade-keyboard-chrome.ts", "deleted legacy");
assertFileMissing(
  "components/community-messenger/room/phase2/messenger-room-mobile-viewport-context.tsx",
  "deleted legacy"
);

// --- flex shell CSS ---
assertIncludes(shellCss, ".cm-room-shell", "chat-viewport-shell.css");
assertIncludes(shellCss, "display: flex", "chat-viewport-shell.css shell flex");
assertIncludes(shellCss, "flex-direction: column", "chat-viewport-shell.css shell column");
assertIncludes(shellCss, "min-height: 0", "chat-viewport-shell.css min-h-0");
assertIncludes(shellCss, ".chat-timeline-scroll", "chat-viewport-shell.css timeline scroll class");
assertIncludes(shellCss, "min-height: 1px", "chat-viewport-shell.css timeline scroll min-height");
assertIncludes(shellCss, "overflow: hidden", "chat-viewport-shell.css shell overflow");
assertIncludes(shellCss, ".cm-room-timeline", "chat-viewport-shell.css timeline");
assertIncludes(shellCss, "overflow-y: auto", "chat-viewport-shell.css timeline scroll");
assertIncludes(shellCss, ".cm-room-composer", "chat-viewport-shell.css composer");
assertIncludes(
  shellCss,
  "padding-bottom: var(--cm-room-composer-bottom-padding, var(--safe-bottom))",
  "chat-viewport-shell.css bottom single authority"
);
assertIncludes(shellCss, "--cm-room-timeline-height", "chat-viewport-shell.css timeline height");
assertIncludes(shellCss, 'data-cm-keyboard-open="true"', "chat-viewport-shell.css keyboard open");
assertNotMatches(shellCss, /position:\s*fixed/, "chat-viewport-shell.css");
assertNotMatches(shellCss, /position:\s*sticky/, "chat-viewport-shell.css");

// --- body shell ---
assertIncludes(shellCss, "--cm-timeline-scroll-padding-bottom", "chat-viewport-shell.css");
assertIncludes(body, "useCmRoomVisibleViewportShell", "Phase2Body");
assertNotIncludes(body, "useCmRoomKbOffset", "Phase2Body");
assertNotIncludes(body, "useCmRoomComposerHeight", "Phase2Body");
assertNotIncludes(body, "onKeyboardInsetChange", "Phase2Body");
assertIncludes(body, "cm-room-shell", "Phase2Body");
assertIncludes(body, "cm-room-timeline", "Phase2Body");
assertIncludes(body, "cm-room-composer", "Phase2Body");
assertNotIncludes(body, "useChatViewportResize", "Phase2Body");

const viewMemo = body.slice(body.indexOf("const view = useMemo"), body.indexOf("const tradeViewerRole"));
assertNotIncludes(viewMemo, "room.message,", "Phase2Body view memo");
assertNotMatches(viewMemo, /\n\s+room,\s*\n/, "Phase2Body view memo whole-room dep");

// --- visible viewport shell ---
assertIncludes(viewportShell, "visualViewport", "use-cm-room-visible-viewport-shell");
assertIncludes(viewportShell, "subscribeSamarketShellKeyboardInsets", "use-cm-room-visible-viewport-shell");
assertIncludes(viewportShell, "resolveCmRoomShellVisualFramePx", "use-cm-room-visible-viewport-shell");
assertIncludes(viewportShell, "resolveIosMessengerPageVisualBandPx", "use-cm-room-visible-viewport-shell");
assertIncludes(viewportShell, "data-cm-ios-vv-band", "use-cm-room-visible-viewport-shell");
assertIncludes(viewportShell, "--cm-ios-vv-band-height", "use-cm-room-visible-viewport-shell");
assertIncludes(viewportShell, "isLikelyIosWebKit", "use-cm-room-visible-viewport-shell");
assertNotIncludes(viewportShell, "translateY(", "use-cm-room-visible-viewport-shell");
assertIncludes(viewportContract, "resolveCmRoomVisibleViewportHeightPx", "cm-room-visible-viewport-contract");
assertIncludes(viewportContract, "resolveCmRoomShellVisualFramePx", "cm-room-visible-viewport-contract");
assertIncludes(viewportContract, "resolveIosMessengerPageVisualBandPx", "cm-room-visible-viewport-contract");
assertIncludes(viewportContract, "CM_ROOM_NAVIGATION_GAP_PX", "cm-room-visible-viewport-contract");
assertIncludes(viewportShell, "--cm-room-visible-height", "use-cm-room-visible-viewport-shell");
assertIncludes(phase2Composer, "isLikelyIosWebKit", "Phase2Composer");

const messengerVt = read("app/messenger-view-transitions.css");
assertIncludes(messengerVt, "data-cm-ios-vv-band", "messenger-view-transitions.css");
assertIncludes(messengerVt, "--cm-ios-vv-band-height", "messenger-view-transitions.css");
assertIncludes(messengerVt, "--cm-ios-vv-band-top", "messenger-view-transitions.css");

// --- iOS kb-offset helper (overlay only, consumed by viewport shell) ---
assertIncludes(kbOffset, "resolveIosKeyboardOverlayCssPx", "use-cm-room-kb-offset");

// --- scroll anchor: vv on Android + iOS for keyboard keep-bottom ---
assertIncludes(scrollAnchor, "keyboard_resize_keep_bottom", "scroll-anchor-controller");
assertIncludes(scrollAnchor, "window.visualViewport", "scroll-anchor-controller");
assertNotIncludes(scrollAnchor, "ios && typeof window", "scroll-anchor-controller vv gate removed");

// --- composer/header: no sticky/fixed keyboard hacks ---
assertNotMatches(chatHeader, /sticky|fixed/, "ChatHeader");
assertNotMatches(chatComposer, /className=.*sticky|className=.*fixed/, "ChatComposer");
assertNotIncludes(phase2Composer, "useMobileKeyboardInset", "Phase2Composer");
assertNotIncludes(phase2Composer, "sticky bottom-0", "Phase2Composer");

if (errors.length > 0) {
  console.error("verify:cm-room-keyboard-layout-contract FAIL");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("verify:cm-room-keyboard-layout-contract OK");
