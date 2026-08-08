import { describe, expect, it } from "vitest";
import {
  isPostAdsAdTypeOpenForNewApply,
  resolvePostAdsAdTypeRole,
} from "@/lib/ads/post-ads-authority";
import {
  getMemberPromotionProduct,
  listActiveMemberPromotionProducts,
} from "@/lib/points/promotion-products";

describe("community paid exposure authority", () => {
  it("quarantines post_ads top_fixed new writes", () => {
    expect(resolvePostAdsAdTypeRole("top_fixed")).toBe("LEGACY_READ_ONLY_COMMUNITY_PIN");
    expect(isPostAdsAdTypeOpenForNewApply("top_fixed")).toBe(false);
    expect(isPostAdsAdTypeOpenForNewApply("mid_insert")).toBe(false);
  });

  it("keeps community catalog prices from live seed (10000/20000)", () => {
    const items = listActiveMemberPromotionProducts("community");
    expect(items.map((p) => p.id)).toEqual(["community_promote_3", "community_promote_7"]);
    expect(getMemberPromotionProduct("community_promote_3")?.pointCost).toBe(10000);
    expect(getMemberPromotionProduct("community_promote_7")?.pointCost).toBe(20000);
    expect(getMemberPromotionProduct("community_promote_3")?.requiresAdminApproval).toBe(true);
  });
});
