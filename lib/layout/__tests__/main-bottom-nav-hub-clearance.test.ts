import { describe, expect, it } from "vitest";
import {
  isMainBottomNavHubBodyClearancePath,
  MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS,
  MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS,
} from "@/lib/layout/main-bottom-nav-hub-clearance";
import { resolveConditionalAppShellFlags } from "@/lib/layout/conditional-app-shell-flags";
import { isDeliveryConsumerBottomNavSurface } from "@/lib/main-menu/delivery-bottom-nav-layout";

describe("main-bottom-nav-hub-clearance", () => {
  it("matches main tab hub roots and feed hubs", () => {
    expect(isMainBottomNavHubBodyClearancePath("/philife")).toBe(true);
    expect(isMainBottomNavHubBodyClearancePath("/mypage")).toBe(true);
    expect(isMainBottomNavHubBodyClearancePath("/market")).toBe(true);
    expect(isMainBottomNavHubBodyClearancePath("/market/used-goods")).toBe(true);
    expect(isMainBottomNavHubBodyClearancePath("/stores")).toBe(true);
    expect(isMainBottomNavHubBodyClearancePath("/community-messenger")).toBe(true);
    expect(isMainBottomNavHubBodyClearancePath("/community-messenger/trade-chats")).toBe(true);
    expect(isMainBottomNavHubBodyClearancePath("/community-messenger/delivery-chats")).toBe(true);
    expect(isMainBottomNavHubBodyClearancePath("/mypage/trade")).toBe(true);
    expect(isMainBottomNavHubBodyClearancePath("/stores/browse/food")).toBe(true);
    expect(isMainBottomNavHubBodyClearancePath("/stores/search")).toBe(true);
    expect(isMainBottomNavHubBodyClearancePath("/stores/cart")).toBe(true);
    expect(isMainBottomNavHubBodyClearancePath("/orders")).toBe(true);
  });

  it("/mypage/store-orders(/*) is NOT body-owned — shell owns tab clearance (v3 §4 ④)", () => {
    for (const path of ["/mypage/store-orders", "/mypage/store-orders/o1", "/my/store-orders"]) {
      expect(isMainBottomNavHubBodyClearancePath(path)).toBe(false);
    }
    const f = resolveConditionalAppShellFlags("/mypage/store-orders", false);
    expect(f.showBottomNav).toBe(true);
    expect(f.mainBottomClass).not.toBe("pb-0");
    expect(f.mainBottomClass).toContain("--safe-bottom");
    const detail = resolveConditionalAppShellFlags("/mypage/store-orders/o1", false);
    expect(detail.mainBottomClass).not.toBe("pb-0");
  });

  it("excludes non-hub surfaces", () => {
    expect(isMainBottomNavHubBodyClearancePath("/market/trade-meet-spot")).toBe(false);
    expect(isMainBottomNavHubBodyClearancePath("/mypage/trade/chat/room-1")).toBe(false);
    expect(isMainBottomNavHubBodyClearancePath("/community-messenger/rooms/abc")).toBe(false);
    expect(isMainBottomNavHubBodyClearancePath("/stores/owner")).toBe(false);
    expect(isMainBottomNavHubBodyClearancePath("/stores/owner/orders")).toBe(false);
    expect(isMainBottomNavHubBodyClearancePath("/stores/foo/cart")).toBe(false);
  });

  it("uses tab height + safe-area only", () => {
    expect(MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS).toContain("60px");
    expect(MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS).toContain("--safe-bottom");
    expect(MESSENGER_HUB_LIST_SCROLL_BOTTOM_INSET_CLASS).toBe(MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS);
  });

  it("delivery consumer clearance paths align with delivery-bottom-nav-layout", () => {
    const samples = [
      "/stores/browse/food",
      "/stores/search",
      "/stores/cart",
      "/mypage/store-orders",
      "/orders",
      "/stores/owner",
      "/stores/owner/orders",
      "/stores/foo",
    ];
    for (const path of samples) {
      const deliveryConsumer = isDeliveryConsumerBottomNavSurface(path);
      const clearance = isMainBottomNavHubBodyClearancePath(path);
      /** 내정보 매장 주문은 배달 탭을 쓰지만 본문이 MyScreen — 셸이 여백 소유 */
      if (deliveryConsumer && !path.startsWith("/mypage/store-orders")) {
        expect(clearance).toBe(true);
      }
      if (path.startsWith("/stores/owner")) {
        expect(clearance).toBe(false);
      }
    }
  });
});

describe("hub shell bottom padding", () => {
  it("/market hub uses pb-0 on shell", () => {
    const f = resolveConditionalAppShellFlags("/market", false);
    expect(f.showBottomNav).toBe(true);
    expect(f.mainBottomClass).toBe("pb-0");
  });

  it("/market/location hides trade hub FAB and owns bottom padding", () => {
    for (const path of ["/market/location", "/market/location/distance", "/market/location/search"]) {
      const f = resolveConditionalAppShellFlags(path, false);
      expect(f.showHomeTradeHubFloatingBar).toBe(false);
      expect(f.mainBottomClass).toBe("pb-0");
    }
  });

  it("/stores hub uses pb-0 on shell", () => {
    const f = resolveConditionalAppShellFlags("/stores", false);
    expect(f.showBottomNav).toBe(true);
    expect(f.mainBottomClass).toBe("pb-0");
  });

  it("/community-messenger hub uses pb-0 on shell", () => {
    const f = resolveConditionalAppShellFlags("/community-messenger", false);
    expect(f.showBottomNav).toBe(true);
    expect(f.mainBottomClass).toBe("pb-0");
  });

  it("/community-messenger/trade-chats and delivery-chats use pb-0 (no shell+child double pad)", () => {
    for (const path of ["/community-messenger/trade-chats", "/community-messenger/delivery-chats"]) {
      const f = resolveConditionalAppShellFlags(path, false);
      expect(f.showBottomNav).toBe(true);
      expect(f.mainBottomClass).toBe("pb-0");
    }
  });

  it("/community-messenger hub list owns scroll without main-column lock", () => {
    const f = resolveConditionalAppShellFlags("/community-messenger", false);
    expect(f.isCommunityMessengerHubListSurface).toBe(true);
    expect(f.isMainColumnViewportLocked).toBe(false);
    const trade = resolveConditionalAppShellFlags("/community-messenger/trade-chats", false);
    expect(trade.isCommunityMessengerHubListSurface).toBe(true);
    const delivery = resolveConditionalAppShellFlags("/community-messenger/delivery-chats", false);
    expect(delivery.isCommunityMessengerHubListSurface).toBe(true);
  });

  it("delivery consumer surfaces with bottom nav use pb-0 on shell", () => {
    for (const path of [
      "/stores/browse/food",
      "/stores/search",
      "/stores/cart",
    ]) {
      const f = resolveConditionalAppShellFlags(path, false);
      expect(f.showBottomNav).toBe(true);
      expect(f.mainBottomClass).toBe("pb-0");
    }
  });

  it("/orders is clearance path but keeps shell pb-4 without bottom nav", () => {
    expect(isMainBottomNavHubBodyClearancePath("/orders")).toBe(true);
    const f = resolveConditionalAppShellFlags("/orders", false);
    expect(f.showBottomNav).toBe(false);
    expect(f.mainBottomClass).toBe("pb-4");
  });
});

describe("body bottom clearance SSOT (H-02 / N-01 / N-06)", () => {
  it("no tab mounted → safe-bottom once (never tab clearance)", async () => {
    const { resolveBodyBottomNavClearanceClass, NO_BOTTOM_NAV_BODY_SAFE_CLASS } = await import(
      "@/lib/layout/main-bottom-nav-hub-clearance"
    );
    expect(resolveBodyBottomNavClearanceClass("/search", false)).toBe(NO_BOTTOM_NAV_BODY_SAFE_CLASS);
    expect(resolveBodyBottomNavClearanceClass("/orders", false)).toBe(NO_BOTTOM_NAV_BODY_SAFE_CLASS);
  });
  it("hub body path with tab → tab + safe; shell-owned path with tab → nothing extra", async () => {
    const { resolveBodyBottomNavClearanceClass, MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS } = await import(
      "@/lib/layout/main-bottom-nav-hub-clearance"
    );
    expect(resolveBodyBottomNavClearanceClass("/stores/search", true)).toBe(MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS);
    expect(resolveBodyBottomNavClearanceClass("/mypage/coupons", true)).toBe("");
  });
  it("shell scroll padding uses the measured overhang var, not the global delivery overhang", async () => {
    const { MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS, MAIN_SCROLL_PADDING_HOME_WITH_FLOAT_CLASS } =
      await import("@/lib/main-menu/bottom-nav-config");
    expect(MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS).toContain("--main-scroll-nav-overhang");
    expect(MAIN_SCROLL_PADDING_HOME_WITH_FLOAT_CLASS).toContain("--main-scroll-nav-overhang");
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("app/app-bottom-nav.css", "utf8");
    expect(css).toMatch(/:root\s*\{\s*--main-scroll-nav-overhang:\s*0px;/);
    expect(css).toContain("html:has(.app-bottom-nav-shell--delivery)");
  });
  it("sheet above-nav anchor drops to the screen bottom when no tab is mounted", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("app/dibay-overlay.css", "utf8");
    expect(css).toContain(
      'html:not(:has(.app-bottom-nav-shell)) .dibay-overlay-root--sheet[data-sheet-anchor="above-bottom-nav"]'
    );
  });
});
