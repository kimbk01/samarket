import { describe, expect, it } from "vitest";
import {
  isOwnerBottomNavMenuDomainPath,
  resolveOwnerBottomNavActiveTabId,
} from "@/lib/delivery/owner/owner-bottom-nav-active";
import { OwnerRoutes } from "@/lib/business/owner-routes";

describe("resolveOwnerBottomNavActiveTabId", () => {
  const search = { get: () => null };

  it("maps owner routes to five tabs", () => {
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner", search)).toBe("home");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/orders", search)).toBe("orders");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/order-chats", search)).toBe(
      "order-chat"
    );
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/order-chat/abc", search)).toBe(
      "order-chat"
    );
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/settings", search)).toBe("settings");
  });

  it("menu domain includes products + menu-categories + legacy /menu", () => {
    expect(isOwnerBottomNavMenuDomainPath("/stores/owner/products")).toBe(true);
    expect(isOwnerBottomNavMenuDomainPath("/stores/owner/products/new")).toBe(true);
    expect(isOwnerBottomNavMenuDomainPath("/stores/owner/products/p1/edit")).toBe(true);
    expect(isOwnerBottomNavMenuDomainPath("/stores/owner/menu-categories")).toBe(true);
    expect(isOwnerBottomNavMenuDomainPath("/stores/owner/menu")).toBe(true);
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/products", search)).toBe("menu");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/menu-categories", search)).toBe("menu");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/menu", search)).toBe("menu");
  });

  it("settings domain excludes products; includes points", () => {
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/products", search)).not.toBe("settings");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/points", search)).toBe("settings");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/profile", search)).toBe("settings");
  });

  it("OwnerRoutes.menu is products hub (no /menu hop for new writers)", () => {
    expect(OwnerRoutes.menu("s1")).toBe("/stores/owner/products?storeId=s1");
    expect(OwnerRoutes.menu()).toBe("/stores/owner/products");
    expect(OwnerRoutes.menu("s1")).not.toContain("/menu?");
    expect(OwnerRoutes.menu("s1")).not.toMatch(/\/stores\/owner\/menu$/);
  });

  it("does not treat consumer store menu as home tab", () => {
    expect(resolveOwnerBottomNavActiveTabId("/stores/my-store", search, "my-store")).toBeNull();
  });
});
