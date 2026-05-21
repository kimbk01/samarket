import { describe, expect, it } from "vitest";
import { composeDeliveryBottomNavDisplayTabs } from "@/lib/main-menu/delivery-bottom-nav-layout";
import { composeMainBottomNavDisplayTabs } from "@/lib/main-menu/main-bottom-nav-split-layout";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";

describe("composeDeliveryBottomNavDisplayTabs", () => {
  it("5탭 순서 — 주문내역·장바구니·배달홈·주문채팅·내정보", () => {
    const tabs = composeDeliveryBottomNavDisplayTabs(null);
    expect(tabs.map((t) => t.id)).toEqual([
      "delivery-orders",
      "delivery-cart",
      "delivery-home-hub",
      "delivery-order-chat",
      "delivery-my",
    ]);
  });
});

describe("composeMainBottomNavDisplayTabs (delivery rail)", () => {
  it("/stores — 6탭이 아닌 배달 5탭", () => {
    const tabs = composeMainBottomNavDisplayTabs("/stores", BOTTOM_NAV_ITEMS, null);
    expect(tabs).toHaveLength(5);
    expect(tabs.some((t) => t.id === "community")).toBe(false);
    expect(tabs.some((t) => t.id === "delivery-home-hub")).toBe(true);
  });

  it("/market — 기존 6탭 유지", () => {
    const tabs = composeMainBottomNavDisplayTabs("/market", BOTTOM_NAV_ITEMS, null);
    expect(tabs).toHaveLength(6);
    expect(tabs[0]?.id).toBe("community");
  });
});
