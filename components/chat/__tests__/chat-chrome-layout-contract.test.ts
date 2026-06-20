/**
 * CM Room Keyboard/Layout LOCK contract tests.
 * @see docs/community-messenger-mobile-room-viewport.md §0
 * @see .cursor/rules/cm-room-keyboard-layout-contract-lock.mdc
 * Also: npm run verify:cm-room-keyboard-layout-contract
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("chat chrome layout contract", () => {
  it("ChatHeader avoids sticky/fixed positioning", () => {
    const src = readSrc("components/chat/ChatHeader.tsx");
    expect(src).not.toMatch(/sticky|fixed/);
    expect(src).toContain("chat-header");
    expect(src).toContain("data-cm-messenger-line-header");
  });

  it("ChatComposer avoids sticky/fixed and keyboard padding hacks", () => {
    const src = readSrc("components/chat/ChatComposer.tsx");
    expect(src).not.toMatch(/className=.*sticky|className=.*fixed/);
    expect(src).not.toMatch(/paddingBottom|safe-area-inset-bottom|keyboardInset/);
    expect(src).toContain("data-cm-composer");
  });

  it("MessengerHeader delegates to ChatHeader without sticky", () => {
    const src = readSrc("components/community-messenger/line-ui/messenger-header.tsx");
    expect(src).toContain("ChatHeader");
    expect(src).not.toMatch(/sticky top-0/);
  });

  it("Phase2 composer footer uses ChatComposer without calc safe-area padding", () => {
    const src = readSrc(
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Composer.tsx"
    );
    expect(src).toContain("ChatComposer");
    expect(src).not.toMatch(/footerPaddingBottom/);
    expect(src).not.toMatch(/useMobileKeyboardInset/);
    expect(src).not.toMatch(/sticky bottom-0/);
  });

  it("shell CSS uses flex-only cm-room-shell contract", () => {
    const css = readSrc("app/chat-viewport-shell.css");
    expect(css).toContain(".cm-room-shell");
    expect(css).toContain(".cm-room-timeline");
    expect(css).toContain(".cm-room-composer");
    expect(css).toContain("padding-top: var(--safe-top)");
    expect(css).toContain("padding-bottom: var(--cm-room-composer-bottom-padding, var(--safe-bottom))");
    expect(css).toContain("--cm-room-timeline-height");
    expect(css).toContain('data-cm-keyboard-open="true"');
    expect(css).not.toContain("--chat-viewport-height");
    expect(css).not.toContain("--chat-bottom-inset");
    expect(css).not.toContain("chat-viewport-shell");
    expect(css).toContain("scroll-padding-bottom: var(--cm-timeline-scroll-padding-bottom, 12px)");
    expect(css).toMatch(/\.cm-room-timeline[\s\S]*overflow:\s*hidden/);
    expect(css).toContain("cm-room-shell--embedded");
    expect(css).not.toMatch(/position:\s*fixed/);
    expect(css).not.toMatch(/position:\s*sticky/);
  });

  it("Phase2 body uses visible viewport shell hook (vv SSOT)", () => {
    const src = readSrc("components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx");
    expect(src).toContain("useCmRoomVisibleViewportShell");
    expect(src).not.toContain("useCmRoomKbOffset");
    expect(src).not.toContain("useCmRoomComposerHeight");
    expect(src).toContain("cm-room-shell");
    expect(src).toContain("cm-room-timeline");
    expect(src).toContain("cm-room-composer");
    expect(src).not.toContain("useChatViewportShellInsets");
    expect(src).not.toContain("keyboardOverlapSuppressed");
    expect(src).not.toContain("MessengerRoomMobileViewportProvider");
    expect(src).not.toContain("useMessengerTradeKeyboardChrome");
    expect(src).not.toContain("messengerKeyboardChromeOpen");
    expect(src).not.toContain("chat-viewport-shell");
    expect(src).not.toContain("data-cm-room-viewport-placeholder");
  });

  it("legacy use-chat-viewport-resize is removed from messenger room", () => {
    const body = readSrc("components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx");
    expect(body).not.toContain("useChatViewportResize");
    expect(body).not.toContain("use-chat-viewport-resize");
  });

  it("iOS kb-offset hook is Android no-op", () => {
    const src = readSrc("lib/ui/use-cm-room-kb-offset.ts");
    expect(src).toContain("--kb-offset");
    expect(src).toContain("isLikelyIosWebKit");
    expect(src).not.toContain("--chat-viewport-height");
    expect(src).not.toContain("--chat-bottom-inset");
  });

  it("Phase2 timeline uses flex-end timeline inner for messenger rooms", () => {
    const src = readSrc(
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx"
    );
    expect(src).toContain("chat-timeline-scroll");
    expect(src).toContain("chat-timeline-inner");
    expect(src).toContain("chat-message-stack");
    expect(src).not.toContain("cm-timeline-tail-padding");
    expect(src).toContain("resolveMessengerRoomTimelineLoadUi");
    expect(src).not.toContain("timelineBootstrapFailed");
    expect(src).not.toContain("shouldRecoverEmptyTimeline");
  });

  it("Phase2 body view memo excludes whole-room and message deps", () => {
    const src = readSrc("components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx");
    const viewMemo = src.slice(src.indexOf("const view = useMemo"), src.indexOf("const tradeViewerRole"));
    expect(viewMemo).not.toContain("room.message,");
    expect(viewMemo).toContain("room.activeSheet");
    expect(viewMemo).not.toMatch(/\n\s+room,\s*\n/);
  });

  it("scroll anchor listens to visualViewport on Android WebView and iOS", () => {
    const src = readSrc("lib/community-messenger/room/messenger-room-scroll-anchor-controller.ts");
    expect(src).toContain("keyboard_resize_keep_bottom");
    expect(src).toContain("window.visualViewport");
    expect(src).not.toMatch(/ios && typeof window[\s\S]*visualViewport/);
  });
});
