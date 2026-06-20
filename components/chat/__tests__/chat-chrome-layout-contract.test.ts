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

  it("shell CSS uses safe-area SSOT on viewport shell and 100dvh narrow modifier", () => {
    const css = readSrc("app/chat-viewport-shell.css");
    expect(css).toContain("padding-top: var(--safe-top)");
    expect(css).toContain("padding-bottom: calc(var(--safe-bottom) + var(--chat-bottom-inset, 0px))");
    expect(css).toContain("--chat-viewport-height");
    expect(css).toContain("--chat-composer-height");
    expect(css).toContain("--chat-bottom-inset");
    expect(css).toContain("sam-chat-viewport-height-active");
    expect(css).toContain("[data-cm-room-segment-layout]");
    expect(css).toContain("chat-timeline-scroll");
    expect(css).toContain("chat-timeline-inner");
    expect(css).toContain("chat-message-stack");
    expect(css).toContain("chat-viewport-shell--embedded");
    expect(css).toContain("chat-viewport-shell--narrow");
    expect(css).toContain("chat-viewport-shell--ios");
    expect(css).toContain("chat-viewport-shell--android");
    expect(css).toContain("100dvh");
    expect(css).not.toMatch(/position:\s*fixed/);
  });

  it("Phase2 body uses embedded shell and unified insets hook", () => {
    const src = readSrc("components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx");
    expect(src).toContain("useChatViewportShellInsets");
    expect(src).toContain("observeComposerHeight: true");
    expect(src).toContain("useOwnerOrderChatSlideHost");
    expect(src).toContain("useBuyerOrderChatSlideHost");
    expect(src).toContain("resolveChatViewportShellClassNames");
  });

  it("legacy use-chat-viewport-resize is removed from messenger room", () => {
    const body = readSrc("components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx");
    expect(body).not.toContain("useChatViewportResize");
    expect(body).not.toContain("use-chat-viewport-resize");
  });

  it("shell insets hook merges composer height observation", () => {
    const src = readSrc("lib/ui/use-chat-viewport-shell-insets.ts");
    expect(src).toContain("observeComposerHeight");
    expect(src).toContain("--chat-composer-height");
    expect(src).toContain("--chat-viewport-height");
    expect(src).toContain("--chat-bottom-inset");
    expect(src).toContain("resolveChatBottomInsetCssPx");
    expect(src).toContain("applyChatViewportHeightToRoot");
    expect(src).toContain("clearChatViewportHeightFromRoot");
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
});
