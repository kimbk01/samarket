import { describe, expect, it } from "vitest";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import { composeDeliveryBottomNavDisplayTabs } from "@/lib/main-menu/delivery-bottom-nav-layout";
import { isMainBottomNavDisplayTabActive } from "@/lib/main-menu/main-bottom-nav-tab-active";

describe("isMainBottomNavDisplayTabActive (delivery 5탭)", () => {
  const tabs = composeDeliveryBottomNavDisplayTabs(null);
  const orders = tabs.find((t) => t.id === "delivery-orders")!;
  const cart = tabs.find((t) => t.id === "delivery-cart")!;
  const home = tabs.find((t) => t.id === "delivery-home-hub")!;
  const my = tabs.find((t) => t.id === "delivery-my")!;

  it("주문내역 — /orders·/mypage/store-orders", () => {
    expect(isMainBottomNavDisplayTabActive("/orders", orders, { secondaryRail: "stores" })).toBe(true);
    expect(isMainBottomNavDisplayTabActive("/orders/store/abc", orders, { secondaryRail: "stores" })).toBe(
      true
    );
    expect(isMainBottomNavDisplayTabActive("/mypage/store-orders", orders, { secondaryRail: "stores" })).toBe(
      true
    );
    expect(isMainBottomNavDisplayTabActive("/stores", orders, { secondaryRail: "stores" })).toBe(false);
  });

  it("장바구니 — /stores/cart 만(슬러그 cart 제외)", () => {
    expect(isMainBottomNavDisplayTabActive("/stores/cart", cart, { secondaryRail: "stores" })).toBe(true);
    expect(isMainBottomNavDisplayTabActive("/stores/foo/cart", cart, { secondaryRail: "stores" })).toBe(false);
    expect(isMainBottomNavDisplayTabActive("/orders", cart, { secondaryRail: "stores" })).toBe(false);
  });

  it("홈 — /stores·search·browse", () => {
    expect(isMainBottomNavDisplayTabActive("/stores", home, { secondaryRail: "stores" })).toBe(true);
    expect(isMainBottomNavDisplayTabActive("/stores/search", home, { secondaryRail: "stores" })).toBe(true);
    expect(isMainBottomNavDisplayTabActive("/stores/cart", home, { secondaryRail: "stores" })).toBe(false);
  });

  it("내정보 — /mypage 허브(거래와 동일), 주문내역 탭 경로 제외", () => {
    expect(isMainBottomNavDisplayTabActive("/mypage", my, { secondaryRail: "stores" })).toBe(true);
    expect(isMainBottomNavDisplayTabActive("/mypage/settings", my, { secondaryRail: "stores" })).toBe(true);
    expect(isMainBottomNavDisplayTabActive("/mypage/store-orders", my, { secondaryRail: "stores" })).toBe(false);
    expect(isMainBottomNavDisplayTabActive("/orders", my, { secondaryRail: "stores" })).toBe(false);
  });

  it("거래 6탭 레일에서는 delivery 탭 id 미사용", () => {
    const tradeHome = BOTTOM_NAV_ITEMS.find((t) => t.id === "home")!;
    expect(isMainBottomNavDisplayTabActive("/market", tradeHome, { secondaryRail: "trade" })).toBe(true);
    expect(isMainBottomNavDisplayTabActive("/orders", orders, { secondaryRail: "trade" })).toBe(true);
  });
});
