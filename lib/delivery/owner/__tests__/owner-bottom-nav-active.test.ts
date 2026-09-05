import { describe, expect, it } from "vitest";
import {
  isOwnerBottomNavProductsDomainPath,
  resolveOwnerBottomNavActiveTabId,
} from "@/lib/delivery/owner/owner-bottom-nav-active";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import {
  OWNER_BOTTOM_NAV_PRIMARY,
  buildOwnerDrawerSectionsFromRegistry,
} from "@/lib/business/owner-nav-registry";

describe("resolveOwnerBottomNavActiveTabId", () => {
  const search = { get: () => null };

  it("maps owner routes to primary five tabs", () => {
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner", search)).toBe("home");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/orders", search)).toBe("orders");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/products", search)).toBe("products");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/customer-care", search)).toBe(
      "customers"
    );
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/settings", search)).toBe("manage");
  });

  it("order chat and reviews activate customers tab (not a dedicated P0 tab)", () => {
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/order-chats", search)).toBe(
      "customers"
    );
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/order-chat/abc", search)).toBe(
      "customers"
    );
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/reviews", search)).toBe("customers");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/inquiries", search)).toBe("customers");
  });

  it("products domain includes products + menu-categories + commerce extras", () => {
    expect(isOwnerBottomNavProductsDomainPath("/stores/owner/products")).toBe(true);
    expect(isOwnerBottomNavProductsDomainPath("/stores/owner/products/new")).toBe(true);
    expect(isOwnerBottomNavProductsDomainPath("/stores/owner/menu-categories")).toBe(true);
    expect(isOwnerBottomNavProductsDomainPath("/stores/owner/coupons")).toBe(true);
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/products", search)).toBe("products");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/menu-categories", search)).toBe(
      "products"
    );
  });

  it("manage domain includes finance/ads/profile; excludes products", () => {
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/products", search)).not.toBe("manage");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/finance", search)).toBe("manage");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/profile", search)).toBe("manage");
    expect(resolveOwnerBottomNavActiveTabId("/stores/owner/ads", search)).toBe("manage");
  });

  it("OwnerRoutes.menu is products hub (no /menu hop for new writers)", () => {
    expect(OwnerRoutes.menu("s1")).toBe("/stores/owner/products?storeId=s1");
    expect(OwnerRoutes.menu()).toBe("/stores/owner/products");
  });

  it("primary nav ids are home orders products customers manage", () => {
    expect(OWNER_BOTTOM_NAV_PRIMARY.map((t) => t.id)).toEqual([
      "home",
      "orders",
      "products",
      "customers",
      "manage",
    ]);
  });

  it("drawer registry collapses ops_review duplicate into one delivery_ops href", () => {
    const sections = buildOwnerDrawerSectionsFromRegistry({
      storeId: "s1",
      slug: "demo",
      approvalStatus: "approved",
      isVisible: true,
      canSell: true,
      orderAlertsBadge: 0,
    });
    const ids = sections.flatMap((s) => s.items.map((i) => i.id));
    expect(ids).toContain("delivery_ops");
    expect(ids).not.toContain("ops_review");
    expect(ids).toContain("reviews");
    const opsHrefs = sections
      .flatMap((s) => s.items)
      .filter((i) => i.href.includes("/ops-status"));
    expect(opsHrefs).toHaveLength(1);
  });
});
