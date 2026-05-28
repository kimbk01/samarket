import { describe, expect, it } from "vitest";
import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";
import {
  getDefaultDeliveryFabConfig,
  isMainBottomNavFabDeliverySurface,
  isMainBottomNavFabHrefActive,
  resolveMainBottomNavFabForPath,
} from "@/lib/main-menu/resolve-main-bottom-nav-fab";

describe("resolve-main-bottom-nav-fab", () => {
  it("isMainBottomNavFabDeliverySurface — 1차 배달 페이지", () => {
    expect(isMainBottomNavFabDeliverySurface("/stores")).toBe(true);
    expect(isMainBottomNavFabDeliverySurface("/stores/cart")).toBe(true);
    expect(isMainBottomNavFabDeliverySurface("/orders")).toBe(true);
    expect(isMainBottomNavFabDeliverySurface("/mypage/store-orders")).toBe(true);
    expect(isMainBottomNavFabDeliverySurface("/stores/search")).toBe(true);
    expect(isMainBottomNavFabDeliverySurface("/stores/browse/restaurant")).toBe(true);
    expect(isMainBottomNavFabDeliverySurface("/stores/foo/cart")).toBe(false);
  });

  it("resolveMainBottomNavFabForPath — stores 탭 FAB", () => {
    const tabs = BOTTOM_NAV_ITEMS.map((tab) =>
      tab.id === "stores" ? { ...tab, fab: getDefaultDeliveryFabConfig() } : tab
    );
    const resolved = resolveMainBottomNavFabForPath("/stores/cart", tabs);
    expect(resolved?.parentTabId).toBe("stores");
    expect(resolved?.items.length).toBe(5);
  });

  it("resolveMainBottomNavFabForPath — stores 탭 코드 기본 FAB", () => {
    const resolved = resolveMainBottomNavFabForPath("/stores", BOTTOM_NAV_ITEMS);
    expect(resolved?.parentTabId).toBe("stores");
    expect(resolved?.items.length).toBe(5);
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
});
