import { describe, expect, it } from "vitest";
import {
  getMemberPromotionProduct,
  listActiveMemberPromotionProducts,
  PROMOTION_PRICE_ASSET,
} from "@/lib/points/promotion-products";
import {
  isPostEligibleForPromotionBoost,
  projectTradeFeedWithPromotions,
} from "@/lib/promotion/feed-promotion-projection";
import {
  FEED_AD_SLOT_AFTER_CONTENT_COUNT,
  selectCampaignForPlacement,
  type FeedAdCampaignView,
} from "@/lib/ads/feed-ad-placement";
import type { PostWithMeta } from "@/lib/posts/schema";

describe("member promotion products", () => {
  it("only prices in D_POINT", () => {
    for (const p of listActiveMemberPromotionProducts()) {
      expect(p.priceAsset).toBe(PROMOTION_PRICE_ASSET);
      expect(p.pointCost).toBeGreaterThan(0);
    }
  });

  it("resolves trade_promote_7 server price", () => {
    expect(getMemberPromotionProduct("trade_promote_7")?.pointCost).toBe(500);
  });
});

describe("promotion eligibility", () => {
  it("blocks sold/hidden from boost", () => {
    expect(isPostEligibleForPromotionBoost("sold")).toBe(false);
    expect(isPostEligibleForPromotionBoost("hidden")).toBe(false);
    expect(isPostEligibleForPromotionBoost("active")).toBe(true);
  });
});

describe("feed promotion projection pagination", () => {
  const mk = (id: string, status = "active"): PostWithMeta =>
    ({ id, status, title: id } as PostWithMeta);

  it("page0 pins max and keeps overflow in organic without duplicate", () => {
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("a"), mk("p4"), mk("b")],
      promotedPosts: [mk("p1"), mk("p2"), mk("p3"), mk("p4")],
      activePromotionIds: new Set(["p1", "p2", "p3", "p4"]),
      maxPage0Pins: 3,
    });
    expect(posts.map((p) => p.id)).toEqual(["p1", "p2", "p3", "a", "p4", "b"]);
    expect(promotedIdsOnPage).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("page0 prepends promoted and excludes pinned from rest", () => {
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("a"), mk("b"), mk("promo")],
      promotedPosts: [mk("promo")],
      activePromotionIds: new Set(["promo"]),
    });
    expect(posts.map((p) => p.id)).toEqual(["promo", "a", "b"]);
    expect(promotedIdsOnPage).toEqual(["promo"]);
  });

  it("page>0 excludes active promoted ids", () => {
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 1,
      normalPosts: [mk("promo"), mk("c")],
      promotedPosts: [],
      activePromotionIds: new Set(["promo"]),
    });
    expect(posts.map((p) => p.id)).toEqual(["c"]);
    expect(promotedIdsOnPage).toEqual([]);
  });
});

describe("feed ad placement isolation", () => {
  it("keeps slot policy constant (not UI hardcode)", () => {
    expect(FEED_AD_SLOT_AFTER_CONTENT_COUNT).toBeGreaterThan(0);
  });

  it("excludes wrong domain/category", () => {
    const base: FeedAdCampaignView = {
      id: "1",
      name: "x",
      domain: "trade",
      placement: "TRADE_CATEGORY",
      targetCategoryId: "cat-a",
      targetTopicSlug: null,
      status: "active",
      priority: 1,
      startAt: null,
      endAt: null,
      destinationType: "internal_page",
      destinationId: "",
      destinationUrl: "",
      slides: [
        {
          id: "s1",
          sortOrder: 1,
          imageUrl: "https://example.com/a.jpg",
          altText: "",
          headline: "",
          description: "",
          ctaLabel: "",
          destinationType: null,
          destinationId: "",
          destinationUrl: "",
        },
      ],
    };
    expect(
      selectCampaignForPlacement([base], {
        domain: "community",
        placement: "COMMUNITY_HOME",
      })
    ).toBeNull();
    expect(
      selectCampaignForPlacement([base], {
        domain: "trade",
        placement: "TRADE_CATEGORY",
        categoryId: "cat-b",
      })
    ).toBeNull();
    expect(
      selectCampaignForPlacement([base], {
        domain: "trade",
        placement: "TRADE_CATEGORY",
        categoryId: "cat-a",
      })?.id
    ).toBe("1");
  });
});
