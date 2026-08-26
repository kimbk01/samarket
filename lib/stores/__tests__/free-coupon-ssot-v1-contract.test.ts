import { describe, expect, it } from "vitest";
import { projectCouponOfferCostRatio } from "@/lib/stores/coupon-offer-roi";
import { buildAdminPromotionCreateHref, buildCouponOfferPromotionDeepLink } from "@/lib/stores/coupon-offer-promotion-deeplink";
import { ownerCouponDetailActions } from "@/lib/stores/owner-coupon-list-bucket";

describe("coupon offer ROI SSOT", () => {
  it("computes GMV / store_funded when store_funded > 0", () => {
    expect(projectCouponOfferCostRatio({ orderSalesPhp: 1000, storeFundedPhp: 200 })).toBe(5);
  });

  it("hides ratio when store_funded is 0 (platform)", () => {
    expect(projectCouponOfferCostRatio({ orderSalesPhp: 1000, storeFundedPhp: 0 })).toBeNull();
  });
});

describe("admin promotion deeplink v1", () => {
  it("builds offer surface deeplink without inventing audience", () => {
    expect(
      buildCouponOfferPromotionDeepLink({
        storeId: "s1",
        offerId: "o1",
        storeSlug: "aa11",
      })
    ).toBe("/stores/aa11?offer=o1");
  });

  it("links existing notification create with deeplink query", () => {
    const href = buildAdminPromotionCreateHref({
      storeId: "s1",
      offerId: "o1",
      storeSlug: "aa11",
      offerTitle: "QA Offer",
    });
    expect(href.startsWith("/admin/notifications/campaigns/new?")).toBe(true);
    expect(href).toContain("deeplink=");
    expect(href).toContain("title=");
  });
});

describe("owner funding authority", () => {
  it("hides mutate actions for platform-funded offers", () => {
    expect(ownerCouponDetailActions("active", { fundingMode: "PLATFORM_FUNDED" })).toEqual([]);
    expect(ownerCouponDetailActions("active", { fundingMode: "STORE_FUNDED" })).toContain("pause");
  });
});
