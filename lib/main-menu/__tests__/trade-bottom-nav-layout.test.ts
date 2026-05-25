import { describe, expect, it } from "vitest";
import {
  composeTradeBottomNavDisplayTabs,
  isTradeConsumerBottomNavSurface,
  isTradeFavoritesBottomNavPath,
  isTradeHistoryBottomNavPath,
} from "@/lib/main-menu/trade-bottom-nav-layout";
import { composeMainBottomNavDisplayTabs } from "@/lib/main-menu/main-bottom-nav-split-layout";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";

describe("composeTradeBottomNavDisplayTabs", () => {
  it("5탭 순서 — 홈·커뮤니티·배달·디바톡·내정보", () => {
    const tabs = composeTradeBottomNavDisplayTabs();
    expect(tabs.map((t) => t.id)).toEqual([
      "trade-home-hub",
      "trade-community",
      "trade-delivery",
      "trade-order-chat",
      "trade-my",
    ]);
    expect(tabs.find((t) => t.id === "trade-home-hub")?.href).toBe("/market");
    expect(tabs.find((t) => t.id === "trade-community")?.href).toBe("/philife");
    expect(tabs.find((t) => t.id === "trade-delivery")?.href).toBe("/stores");
    expect(tabs.find((t) => t.id === "trade-order-chat")?.labelKey).toBe("nav.chat");
    expect(tabs.find((t) => t.id === "trade-order-chat")?.href).toContain("/community-messenger/trade-chats");
  });
});

describe("trade tab path helpers", () => {
  it("isTradeConsumerBottomNavSurface", () => {
    expect(isTradeConsumerBottomNavSurface("/market")).toBe(true);
    expect(isTradeConsumerBottomNavSurface("/market/jobs")).toBe(true);
    expect(isTradeConsumerBottomNavSurface("/market/trade-meet-spot")).toBe(false);
    expect(isTradeConsumerBottomNavSurface("/philife")).toBe(false);
  });

  it("isTradeHistoryBottomNavPath", () => {
    expect(isTradeHistoryBottomNavPath("/mypage/trade")).toBe(true);
    expect(isTradeHistoryBottomNavPath("/mypage/trade/favorites")).toBe(false);
  });

  it("isTradeFavoritesBottomNavPath", () => {
    expect(isTradeFavoritesBottomNavPath("/mypage/trade/favorites")).toBe(true);
  });
});

describe("composeMainBottomNavDisplayTabs (trade rail)", () => {
  it("/market — admin main-bottom-nav 과 동일 5탭", () => {
    const tabs = composeMainBottomNavDisplayTabs("/market", BOTTOM_NAV_ITEMS, null);
    expect(tabs.map((t) => t.id)).toEqual(BOTTOM_NAV_ITEMS.map((t) => t.id));
  });

  it("/mypage/trade/favorites — 경로와 무관하게 admin 탭", () => {
    const tabs = composeMainBottomNavDisplayTabs("/mypage/trade/favorites", BOTTOM_NAV_ITEMS, null);
    expect(tabs.map((t) => t.id)).toEqual(BOTTOM_NAV_ITEMS.map((t) => t.id));
  });
});
