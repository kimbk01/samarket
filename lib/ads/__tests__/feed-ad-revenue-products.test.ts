import { describe, expect, it } from "vitest";
import {
  getFeedAdProduct,
  listActiveFeedAdProducts,
} from "@/lib/ads/feed-ad-products";
import {
  getMemberPromotionProduct,
  listActiveMemberPromotionProducts,
} from "@/lib/points/promotion-products";

describe("feed banner products reuse proven prices", () => {
  it("matches trade list_top / premium and plife top_fixed seeds", () => {
    expect(getFeedAdProduct("feed_banner_trade_3")?.pointCost).toBe(8000);
    expect(getFeedAdProduct("feed_banner_trade_7")?.pointCost).toBe(15000);
    expect(getFeedAdProduct("feed_banner_community_3")?.pointCost).toBe(10000);
    expect(getFeedAdProduct("feed_banner_community_7")?.pointCost).toBe(20000);
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
