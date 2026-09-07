import { describe, expect, it } from "vitest";
import {
  FEED_AD_PRODUCT_DEPLOY_SEED,
  mapFeedAdProductRow,
} from "@/lib/ads/feed-ad-products";
import {
  getMemberPromotionProduct,
  listActiveMemberPromotionProducts,
} from "@/lib/points/promotion-products";

describe("feed banner products — DB row mapper + deploy seed", () => {
  it("maps DB rows to product contract", () => {
    const p = mapFeedAdProductRow({
      id: "feed_banner_trade_3",
      domain: "trade",
      duration_days: 3,
      point_cost: 8000,
      title_ko: "거래 피드 광고 3일",
      title_en: "Trade feed ad 3 days",
      sort_order: 10,
      is_active: true,
    });
    expect(p?.pointCost).toBe(8000);
    expect(p?.durationDays).toBe(3);
    expect(p?.active).toBe(true);
  });

  it("deploy seed reference stays aligned with migration baseline", () => {
    expect(FEED_AD_PRODUCT_DEPLOY_SEED).toHaveLength(4);
    expect(FEED_AD_PRODUCT_DEPLOY_SEED.find((s) => s.id === "feed_banner_trade_3")?.pointCost).toBe(
      8000
    );
    expect(
      FEED_AD_PRODUCT_DEPLOY_SEED.find((s) => s.id === "feed_banner_community_7")?.pointCost
    ).toBe(20000);
  });

  it("rejects invalid domain rows", () => {
    expect(mapFeedAdProductRow({ id: "x", domain: "store", duration_days: 3, point_cost: 1 })).toBeNull();
  });
});

describe("paid exposure family includes community", () => {
  it("community prices from top_fixed seed and activate immediately", () => {
    const c3 = getMemberPromotionProduct("community_promote_3");
    expect(c3?.pointCost).toBe(10000);
    expect(c3?.requiresAdminApproval).toBe(false);
    expect(listActiveMemberPromotionProducts("community").length).toBe(2);
  });

  it("trade listing promotion skips admin approval (auto-live)", () => {
    expect(getMemberPromotionProduct("trade_promote_7")?.requiresAdminApproval).toBe(false);
  });
});
