import { describe, expect, it } from "vitest";
import {
  getMemberPromotionProduct,
  listActiveMemberPromotionProducts,
  PROMOTION_PRICE_ASSET,
} from "@/lib/points/promotion-products";
import {
  annotatePromotedPosts,
  isPostEligibleForPromotionBoost,
  MAX_PAGE0_PROMOTED_PINS,
  overlayTradePromotionBadges,
  projectTradeFeedWithPromotions,
  tradePromotionPageIndexFromRequestPage,
} from "@/lib/promotion/feed-promotion-projection";
import { postHasTradePromotionOverlay } from "@/lib/promotion/trade-promotion-overlay";
import { resolveMarketplacePublicListingStatus } from "@/lib/trade/marketplace/public-listing-status";
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
  it("allows public ACTIVE including L1 inquiry/negotiating/reserved", () => {
    expect(isPostEligibleForPromotionBoost("active", "inquiry")).toBe(true);
    expect(isPostEligibleForPromotionBoost("active", "negotiating")).toBe(true);
    expect(isPostEligibleForPromotionBoost("reserved")).toBe(true);
    expect(isPostEligibleForPromotionBoost("active", "reserved")).toBe(true);
  });

  it("blocks sold and L1 completed", () => {
    expect(isPostEligibleForPromotionBoost("sold")).toBe(false);
    expect(isPostEligibleForPromotionBoost("active", "completed")).toBe(false);
  });

  it("blocks hidden/non-public even though projector maps hidden to active", () => {
    expect(resolveMarketplacePublicListingStatus({ status: "hidden" })).toBe("active");
    expect(isPostEligibleForPromotionBoost("hidden")).toBe(false);
    expect(isPostEligibleForPromotionBoost("hidden", "inquiry")).toBe(false);
    expect(isPostEligibleForPromotionBoost("blinded")).toBe(false);
    expect(isPostEligibleForPromotionBoost("deleted")).toBe(false);
    expect(isPostEligibleForPromotionBoost("suspended")).toBe(false);
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

describe("CUT F LIST pin — 1-based page → 0-based pageIndex", () => {
  const mk = (id: string, status = "active"): PostWithMeta =>
    ({ id, status, title: id } as PostWithMeta);

  it("maps request page=1 to pageIndex 0 and page=2+ to pageIndex ≥1", () => {
    expect(tradePromotionPageIndexFromRequestPage(1)).toBe(0);
    expect(tradePromotionPageIndexFromRequestPage(2)).toBe(1);
    expect(tradePromotionPageIndexFromRequestPage(3)).toBe(2);
  });

  it("LIST page=1 (q none) pins at most 3, badges only those rows, duplicate id 0", () => {
    const pageIndex = tradePromotionPageIndexFromRequestPage(1);
    expect(pageIndex).toBe(0);
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex,
      normalPosts: [mk("a"), mk("p4"), mk("b")],
      promotedPosts: [mk("p1"), mk("p2"), mk("p3"), mk("p4")],
      activePromotionIds: new Set(["p1", "p2", "p3", "p4"]),
      maxPage0Pins: MAX_PAGE0_PROMOTED_PINS,
    });
    const ids = posts.map((p) => p.id);
    expect(ids.slice(0, 3)).toEqual(["p1", "p2", "p3"]);
    expect(ids).toEqual(["p1", "p2", "p3", "a", "p4", "b"]);
    expect(new Set(ids).size).toBe(ids.length);
    const annotated = annotatePromotedPosts(posts, new Set(promotedIdsOnPage));
    for (const p of annotated) {
      expect(postHasTradePromotionOverlay(p)).toBe(promotedIdsOnPage.includes(p.id));
    }
  });

  it("LIST page=2+ (q none) prepends 0 promoted pins", () => {
    const pageIndex = tradePromotionPageIndexFromRequestPage(2);
    expect(pageIndex).toBe(1);
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex,
      normalPosts: [mk("c"), mk("d")],
      promotedPosts: [mk("p1"), mk("p2"), mk("p3")],
      activePromotionIds: new Set(["p1", "p2", "p3"]),
    });
    expect(posts.map((p) => p.id)).toEqual(["c", "d"]);
    expect(posts[0]?.id).not.toBe("p1");
    expect(promotedIdsOnPage).toEqual([]);
  });
});

describe("CUT F SEARCH overlay — badge only, no pin", () => {
  const mk = (id: string, status = "active"): PostWithMeta =>
    ({ id, status, title: id } as PostWithMeta);

  it("badge projection does not prepend, sort, or partition — ID order identical", () => {
    const ranked = [mk("t1"), mk("t2"), mk("t3"), mk("z-promo"), mk("t4")];
    const beforeIds = ranked.map((p) => p.id);
    const { posts, promotedIdsOnPage } = overlayTradePromotionBadges({
      posts: ranked,
      activePromotionIds: new Set(["z-promo", "missing-from-window"]),
    });
    const afterIds = posts.map((p) => p.id);
    expect(afterIds).toEqual(beforeIds);
    expect(afterIds).toEqual(["t1", "t2", "t3", "z-promo", "t4"]);
    expect(afterIds[0]).not.toBe("z-promo");
    expect(promotedIdsOnPage).toEqual(["z-promo"]);
    expect(postHasTradePromotionOverlay(posts[3]!)).toBe(true);
    expect(postHasTradePromotionOverlay(posts[0]!)).toBe(false);
    expect(postHasTradePromotionOverlay(posts[1]!)).toBe(false);
    expect(postHasTradePromotionOverlay(posts[2]!)).toBe(false);
    expect(postHasTradePromotionOverlay(posts[4]!)).toBe(false);
  });

  it("does not strip promoted listings from later pages", () => {
    const { posts, promotedIdsOnPage } = overlayTradePromotionBadges({
      posts: [mk("promo"), mk("c")],
      activePromotionIds: new Set(["promo"]),
    });
    expect(posts.map((p) => p.id)).toEqual(["promo", "c"]);
    expect(promotedIdsOnPage).toEqual(["promo"]);
  });

  it("does not inject entitlements that are absent from the ranked window", () => {
    const { posts, promotedIdsOnPage } = overlayTradePromotionBadges({
      posts: [mk("a"), mk("b")],
      activePromotionIds: new Set(["p1", "p2", "p3"]),
    });
    expect(posts.map((p) => p.id)).toEqual(["a", "b"]);
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
