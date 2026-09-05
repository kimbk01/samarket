import { describe, expect, it } from "vitest";
import {
  buildLegacyOwnerRedirectHref,
  mapLegacyOwnerPath,
  OwnerRoutes,
} from "@/lib/business/owner-routes";

describe("legacy owner path mapping", () => {
  it("maps /my/business hub and store-orders to canonical owner routes", () => {
    expect(mapLegacyOwnerPath("/my/business")).toBe("/stores/owner");
    expect(mapLegacyOwnerPath("/my/business/store-orders")).toBe("/stores/owner/orders");
    expect(mapLegacyOwnerPath("/my/business/profile")).toBe("/stores/owner/profile");
    expect(mapLegacyOwnerPath("/mypage/business/orders")).toBe("/stores/owner/orders");
  });

  it("preserves storeId on redirect href", () => {
    expect(buildLegacyOwnerRedirectHref("/my/business/banners", { storeId: "s1" })).toBe(
      "/stores/owner/banners?storeId=s1"
    );
    expect(buildLegacyOwnerRedirectHref("/my/business", {})).toBe("/stores/owner");
  });

  it("keeps OwnerRoutes.productEdit as canonical edit target", () => {
    expect(OwnerRoutes.productEdit("p1", "s1")).toBe(
      "/stores/owner/products/p1/edit?storeId=s1"
    );
  });

  it("uses Finance as the canonical Owner Coin and Cash route", () => {
    expect(OwnerRoutes.finance("s1")).toBe("/stores/owner/finance?storeId=s1");
    expect(OwnerRoutes.points("s1")).toBe(OwnerRoutes.finance("s1"));
  });

  it("exposes canonical Owner notifications routes", () => {
    expect(OwnerRoutes.notifications("s1")).toBe("/stores/owner/notifications?storeId=s1");
    expect(OwnerRoutes.notificationSettings("s1")).toBe(
      "/stores/owner/notification-settings?storeId=s1"
    );
  });
});
