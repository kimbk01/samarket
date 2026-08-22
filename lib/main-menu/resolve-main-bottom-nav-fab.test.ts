import { describe, expect, it } from "vitest";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import {
  getDefaultDeliveryFabConfig,
  isMainBottomNavFabDeliverySurface,
  isMainBottomNavFabHrefActive,
  resolveMainBottomNavFabForPath,
} from "@/lib/main-menu/resolve-main-bottom-nav-fab";

describe("resolve-main-bottom-nav-fab", () => {
  it("isMainBottomNavFabDeliverySurface — CUT-D consumer FAB off", () => {
    expect(isMainBottomNavFabDeliverySurface("/stores")).toBe(false);
    expect(isMainBottomNavFabDeliverySurface("/stores/cart")).toBe(false);
    expect(isMainBottomNavFabDeliverySurface("/orders")).toBe(false);
    expect(isMainBottomNavFabDeliverySurface("/mypage/store-orders")).toBe(false);
    expect(isMainBottomNavFabDeliverySurface("/stores/search")).toBe(false);
    expect(isMainBottomNavFabDeliverySurface("/stores/browse/restaurant")).toBe(false);
    expect(isMainBottomNavFabDeliverySurface("/stores/foo/cart")).toBe(false);
  });

  it("resolveMainBottomNavFabForPath — CUT-D always null on delivery surfaces", () => {
    const tabs = BOTTOM_NAV_ITEMS.map((tab) =>
      tab.id === "stores" ? { ...tab, fab: getDefaultDeliveryFabConfig() } : tab
    );
    expect(resolveMainBottomNavFabForPath("/stores/cart", tabs)).toBeNull();
    expect(resolveMainBottomNavFabForPath("/stores", BOTTOM_NAV_ITEMS)).toBeNull();
  });

  it("resolveMainBottomNavFabForPath — FAB 명시 비활성 시 null", () => {
    const tabs = BOTTOM_NAV_ITEMS.map((tab) =>
      tab.id === "stores" ? { ...tab, fab: { enabled: false as const, items: [] } } : tab
    );
    expect(resolveMainBottomNavFabForPath("/stores", tabs)).toBeNull();
  });

  it("isMainBottomNavFabHrefActive — 주문내역·장바구니", () => {
    expect(isMainBottomNavFabHrefActive("/orders", "/orders")).toBe(true);
    expect(isMainBottomNavFabHrefActive("/stores/cart", "/stores/cart")).toBe(true);
    expect(isMainBottomNavFabHrefActive("/stores", "/stores/cart")).toBe(false);
  });

  it("isMainBottomNavFabHrefActive — 매장 어드민", () => {
    expect(isMainBottomNavFabHrefActive("/stores/owner", "/stores/owner")).toBe(true);
    expect(isMainBottomNavFabHrefActive("/stores/owner/orders", "/stores/owner")).toBe(true);
    expect(isMainBottomNavFabHrefActive("/stores/browse/restaurant", "/stores/owner")).toBe(false);
  });

  it("getDefaultDeliveryFabConfig — admin/editor structure retained", () => {
    expect(getDefaultDeliveryFabConfig().enabled).toBe(true);
    expect(getDefaultDeliveryFabConfig().items.length).toBe(5);
  });
});
