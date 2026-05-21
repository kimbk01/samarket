import { describe, expect, it } from "vitest";
import {
  composeDeliveryBottomNavDisplayTabs,
  isDeliveryCartBottomNavPath,
  isDeliveryConsumerBottomNavSurface,
  isDeliveryOrderHistoryBottomNavPath,
} from "@/lib/main-menu/delivery-bottom-nav-layout";
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

describe("isDeliveryConsumerBottomNavSurface", () => {
  it("주문내역·통합 장바구니·배달 허브", () => {
    expect(isDeliveryConsumerBottomNavSurface("/orders")).toBe(true);
    expect(isDeliveryConsumerBottomNavSurface("/orders/store/abc")).toBe(true);
    expect(isDeliveryConsumerBottomNavSurface("/mypage/store-orders")).toBe(true);
    expect(isDeliveryConsumerBottomNavSurface("/stores/cart")).toBe(true);
    expect(isDeliveryConsumerBottomNavSurface("/stores")).toBe(true);
  });

  it("매장 메뉴·슬러그 장바구니·오너 — 제외", () => {
    expect(isDeliveryConsumerBottomNavSurface("/stores/foo")).toBe(false);
    expect(isDeliveryConsumerBottomNavSurface("/stores/foo/cart")).toBe(false);
    expect(isDeliveryConsumerBottomNavSurface("/stores/owner/orders")).toBe(false);
  });
});

describe("delivery tab path helpers", () => {
  it("isDeliveryOrderHistoryBottomNavPath", () => {
    expect(isDeliveryOrderHistoryBottomNavPath("/orders")).toBe(true);
    expect(isDeliveryOrderHistoryBottomNavPath("/mypage/store-orders/1")).toBe(true);
    expect(isDeliveryOrderHistoryBottomNavPath("/stores/cart")).toBe(false);
  });

  it("isDeliveryCartBottomNavPath — 통합 장바구니만", () => {
    expect(isDeliveryCartBottomNavPath("/stores/cart")).toBe(true);
    expect(isDeliveryCartBottomNavPath("/stores/foo/cart")).toBe(false);
  });
});

describe("composeMainBottomNavDisplayTabs (delivery rail)", () => {
  it("/stores — 6탭이 아닌 배달 5탭", () => {
    const tabs = composeMainBottomNavDisplayTabs("/stores", BOTTOM_NAV_ITEMS, null);
    expect(tabs).toHaveLength(5);
    expect(tabs.some((t) => t.id === "community")).toBe(false);
    expect(tabs.some((t) => t.id === "delivery-home-hub")).toBe(true);
  });

  it("/orders·/stores/cart — 배달 5탭", () => {
    for (const path of ["/orders", "/orders?tab=store", "/stores/cart", "/mypage/store-orders"]) {
      const tabs = composeMainBottomNavDisplayTabs(path, BOTTOM_NAV_ITEMS, null);
      expect(tabs).toHaveLength(5);
      expect(tabs.map((t) => t.id)).toEqual([
        "delivery-orders",
        "delivery-cart",
        "delivery-home-hub",
        "delivery-order-chat",
        "delivery-my",
      ]);
    }
  });

  it("/market — 기존 6탭 유지", () => {
    const tabs = composeMainBottomNavDisplayTabs("/market", BOTTOM_NAV_ITEMS, null);
    expect(tabs).toHaveLength(6);
    expect(tabs[0]?.id).toBe("community");
  });
});
