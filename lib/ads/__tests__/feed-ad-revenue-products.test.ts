import { describe, expect, it } from "vitest";
import {
  getFeedAdProduct,
  listActiveFeedAdProducts,
} from "@/lib/ads/feed-ad-products";
import {
  getMemberPromotionProduct,
  listActiveMemberPromotionProducts,
} from "@/lib/points/promotion-products";

/** DB seed rows from migration 20261024120000 — must stay in lockstep with CODE SSOT. */
const FEED_AD_PRODUCTS_DB_SEED = [
  { id: "feed_banner_trade_3", domain: "trade", duration_days: 3, point_cost: 8000 },
  { id: "feed_banner_trade_7", domain: "trade", duration_days: 7, point_cost: 15000 },
  { id: "feed_banner_community_3", domain: "community", duration_days: 3, point_cost: 10000 },
  { id: "feed_banner_community_7", domain: "community", duration_days: 7, point_cost: 20000 },
] as const;

describe("feed banner products — CODE AUTHORITY SSOT", () => {
  it("matches trade list_top / premium and plife top_fixed seeds", () => {
    expect(getFeedAdProduct("feed_banner_trade_3")?.pointCost).toBe(8000);
    expect(getFeedAdProduct("feed_banner_trade_7")?.pointCost).toBe(15000);
    expect(getFeedAdProduct("feed_banner_community_3")?.pointCost).toBe(10000);
    expect(getFeedAdProduct("feed_banner_community_7")?.pointCost).toBe(20000);
  });

  it("code catalog matches DB seed migration (no dual price drift)", () => {
    for (const seed of FEED_AD_PRODUCTS_DB_SEED) {
      const p = getFeedAdProduct(seed.id);
      expect(p, seed.id).toBeTruthy();
      expect(p!.domain).toBe(seed.domain);
      expect(p!.durationDays).toBe(seed.duration_days);
      expect(p!.pointCost).toBe(seed.point_cost);
    }
    expect(listActiveFeedAdProducts()).toHaveLength(FEED_AD_PRODUCTS_DB_SEED.length);
  });

  it("filters by domain", () => {
    expect(listActiveFeedAdProducts("trade").every((p) => p.domain === "trade")).toBe(true);
  });
});

describe("paid exposure family includes community", () => {
  it("community prices from top_fixed seed and require approval", () => {
    const c3 = getMemberPromotionProduct("community_promote_3");
    expect(c3?.pointCost).toBe(10000);
    expect(c3?.requiresAdminApproval).toBe(true);
    expect(listActiveMemberPromotionProducts("community").length).toBe(2);
  });

  it("trade still immediate", () => {
    expect(getMemberPromotionProduct("trade_promote_7")?.requiresAdminApproval).toBe(false);
  });
});
