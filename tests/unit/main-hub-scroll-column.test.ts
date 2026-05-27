import { describe, expect, it } from "vitest";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import {
  MAIN_HUB_SCROLL_BODY_CLASS,
  MAIN_HUB_SCROLL_SHELL_ROOT_CLASS,
  resolvesMainHubScrollColumn,
} from "@/lib/layout/main-hub-scroll-column";
import { resolvesMainScrollInMainColumn } from "@/lib/layout/main-shell-viewport";

describe("main-hub-scroll-column", () => {
  it("enables hub column on /stores/browse with regionBarInLayout", () => {
    const f = resolveConditionalAppShellFlags("/stores/browse/restaurant", true);
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
  });

  it("enables hub column on /stores with regionBarInLayout", () => {
    const f = resolveConditionalAppShellFlags("/stores", true);
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
  });

  it("disables hub column on chat room", () => {
    const f = resolveConditionalAppShellFlags("/community-messenger/rooms/abc", true);
    expect(
      resolvesMainHubScrollColumn({
        regionBarInLayout: true,
        mainScrollInMainColumn: false,
        isChatRoomDetail: f.isChatRoomDetail,
      })
    ).toBe(false);
  });

  it("exports shell and body class tokens", () => {
    expect(MAIN_HUB_SCROLL_SHELL_ROOT_CLASS).toContain("main-hub-scroll-shell");
    expect(MAIN_HUB_SCROLL_BODY_CLASS).toBe("main-hub-scroll-body");
  });
});
