import { describe, expect, it } from "vitest";
import {
  isTradeConsumerBottomNavSurface,
  isTradeFavoritesBottomNavPath,
  isTradeHistoryBottomNavPath,
} from "@/lib/main-menu/trade-bottom-nav-layout";
import { composeMainBottomNavDisplayTabs } from "@/lib/main-menu/main-bottom-nav-split-layout";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";

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
