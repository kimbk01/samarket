import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { resolvesMainScrollInMainColumn } from "@/lib/layout/main-shell-viewport";
import { resolvesMainHubScrollColumn } from "@/lib/layout/main-hub-scroll-column";

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("messenger hub single-scroll SSOT", () => {
  it("hub list surfaces own child scroll without locking main column (keeps AppStickyHeader)", () => {
    for (const path of [
      "/community-messenger",
      "/community-messenger/trade-chats",
      "/community-messenger/delivery-chats",
    ]) {
      const f = resolveConditionalAppShellFlags(path, true);
      expect(f.isCommunityMessengerHubListSurface).toBe(true);
      expect(f.isMainColumnViewportLocked).toBe(false);
      const mainScroll = resolvesMainScrollInMainColumn({
        isChatRoomDetail: f.isChatRoomDetail,
        isStoreOwnerAdminRoute: f.isStoreOwnerAdminRoute,
        isMainColumnViewportLocked: f.isMainColumnViewportLocked,
      });
      expect(mainScroll).toBe(true);
      expect(
        resolvesMainHubScrollColumn({
          regionBarInLayout: true,
          mainScrollInMainColumn: mainScroll,
          isChatRoomDetail: f.isChatRoomDetail,
        })
      ).toBe(true);
    }
  });

  it("room detail is not hub list surface", () => {
    const f = resolveConditionalAppShellFlags("/community-messenger/rooms/abc", true);
    expect(f.isCommunityMessengerHubListSurface).toBe(false);
  });

  it("BottomNav hide selector stays on hub list scroll", () => {
    const src = readSrc("lib/layout/use-bottom-nav-scroll-hide-behavior.ts");
    expect(src).toContain('[data-messenger-hub-list-scroll]');
    expect(src).not.toMatch(/document\.scrollingElement.*MESSENGER_HUB/);
  });

  it("MasterDetail hub/split panes are overflow-hidden (not hub overflow-y-auto)", () => {
    const src = readSrc("components/community-messenger/home/CommunityMessengerHomeMasterDetail.tsx");
    expect(src).toContain("overflow-hidden");
    expect(src).toMatch(/LIST_PANE_HUB_CLASS[\s\S]*overflow-hidden/);
    expect(src).not.toMatch(/Hub: pane 스크롤/);
    expect(src).not.toMatch(/overflow-y-auto overflow-x-hidden/);
  });

  it("MainSections chrome is sibling shrink-0; list is sole vertical scroller", () => {
    const src = readSrc("components/community-messenger/MessengerHomeMainSections.tsx");
    expect(src).toContain('data-messenger-hub-sticky-chrome=""');
    expect(src).toContain('data-messenger-hub-list-scroll=""');
    const chromeIdx = src.indexOf("data-messenger-hub-sticky-chrome");
    const listIdx = src.indexOf("data-messenger-hub-list-scroll");
    expect(chromeIdx).toBeGreaterThan(-1);
    expect(listIdx).toBeGreaterThan(chromeIdx);
    const chromeBlock = src.slice(chromeIdx - 120, chromeIdx + 80);
    expect(chromeBlock).toMatch(/shrink-0/);
    expect(chromeBlock).not.toMatch(/sticky top-0/);
    const listBlock = src.slice(listIdx - 200, listIdx + 40);
    expect(listBlock).toMatch(/overflow-y-auto/);
    expect(listBlock).toMatch(/flex-1/);
    expect(listBlock).toMatch(/min-h-0/);
  });

  it("ListPane removes min-h-[56dvh] expansion; home root locks overflow", () => {
    const listPane = readSrc("components/community-messenger/CommunityMessengerHomeListPane.tsx");
    expect(listPane).not.toMatch(/min-h-\[56dvh\]/);
    expect(listPane).toMatch(/flex min-h-0 flex-1 flex-col overflow-hidden/);
    const home = readSrc("components/community-messenger/CommunityMessengerHome.tsx");
    expect(home).toMatch(/data-cm-messenger-home-root[\s\S]{0,400}overflow-hidden/);
  });

  it("shell CSS locks hub body overflow for messenger child scroll", () => {
    const css = readSrc("app/app-shell.css");
    expect(css).toContain("main-hub-scroll-body--child-scroll-lock");
    expect(css).toMatch(
      /\.main-hub-scroll-body\.main-hub-scroll-body--child-scroll-lock\s*\{[^}]*overflow-y:\s*hidden/
    );
    const shell = readSrc("components/layout/ConditionalAppShell.tsx");
    expect(shell).toContain("isCommunityMessengerHubListSurface");
    expect(shell).toContain("main-hub-scroll-body--child-scroll-lock");
  });

  it("room ChatHeader stays non-sticky (home fix must not touch room chrome)", () => {
    const header = readSrc("components/chat/ChatHeader.tsx");
    expect(header).not.toMatch(/sticky top-0/);
    expect(header).toContain("data-chat-header");
  });
});
