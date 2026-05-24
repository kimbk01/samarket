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

  it("5탭 순서 — 내역·찜·홈·거래채팅·내정보", () => {

    const tabs = composeTradeBottomNavDisplayTabs();

    expect(tabs.map((t) => t.id)).toEqual([

      "trade-history",

      "trade-favorites",

      "trade-home-hub",

      "trade-order-chat",

      "trade-my",

    ]);

    expect(tabs.find((t) => t.id === "trade-home-hub")?.href).toBe("/market");

    expect(tabs.find((t) => t.id === "trade-favorites")?.href).toBe("/mypage/trade/favorites");

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

  it("/market — 거래 5탭", () => {

    const tabs = composeMainBottomNavDisplayTabs("/market", BOTTOM_NAV_ITEMS, null);

    expect(tabs).toHaveLength(5);

    expect(tabs.some((t) => t.id === "community")).toBe(false);

    expect(tabs.some((t) => t.id === "trade-home-hub")).toBe(true);

  });



  it("/mypage/trade/favorites — 거래 5탭", () => {

    const tabs = composeMainBottomNavDisplayTabs("/mypage/trade/favorites", BOTTOM_NAV_ITEMS, null);

    expect(tabs).toHaveLength(5);

    expect(tabs.map((t) => t.id)).toEqual([

      "trade-history",

      "trade-favorites",

      "trade-home-hub",

      "trade-order-chat",

      "trade-my",

    ]);

  });

});

