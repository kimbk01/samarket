import { describe, expect, it } from "vitest";
import {
  getMemberPromotionProduct,
  listActiveMemberPromotionProducts,
  PROMOTION_PRICE_ASSET,
} from "@/lib/points/promotion-products";
import {
  annotatePromotedPosts,
  isLiveTradePromotionEntitlement,
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

describe("live entitlement window (approve clock)", () => {
  const t0 = Date.parse("2026-08-20T00:00:00.000Z");
  it("is live only when active and now is inside [start, end]", () => {
    expect(
      isLiveTradePromotionEntitlement({
        orderStatus: "active",
        startAt: "2026-08-20T00:00:00.000Z",
        endAt: "2026-08-27T00:00:00.000Z",
        nowMs: t0,
      })
    ).toBe(true);
    expect(
      isLiveTradePromotionEntitlement({
        orderStatus: "pending_review",
        startAt: "2026-08-20T00:00:00.000Z",
        endAt: "2026-08-27T00:00:00.000Z",
        nowMs: t0,
      })
    ).toBe(false);
    expect(
      isLiveTradePromotionEntitlement({
        orderStatus: "active",
        startAt: "2026-08-20T00:00:00.000Z",
        endAt: "2026-08-27T00:00:00.000Z",
        nowMs: Date.parse("2026-08-28T00:00:00.000Z"),
      })
    ).toBe(false);
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

  it("Owner 2026-11-05 「1건」: 최근 결제 1개만 첫 칸 뒤에 끼우고, 2번째 결제부터는 일반 자리에 남는다", () => {
    // promotedPosts 는 start_at 내림차순으로 들어온다(p1 이 가장 최근 결제)
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("a"), mk("p4"), mk("b"), mk("p2")],
      promotedPosts: [mk("p1"), mk("p2"), mk("p3"), mk("p4")],
      activePromotionIds: new Set(["p1", "p2", "p3", "p4"]),
    });
    expect(MAX_PAGE0_PROMOTED_PINS).toBe(1);
    expect(promotedIdsOnPage).toEqual(["p1"]);
    expect(posts.map((p) => p.id)).toEqual(["a", "p1", "p4", "b", "p2"]);
  });

  it("재감사 R2: 같은 입력이면 시간이 바뀌어도 같은 글(시간 단위 회전 없음)", () => {
    const run = () =>
      projectTradeFeedWithPromotions({
        pageIndex: 0,
        normalPosts: [mk("a")],
        promotedPosts: [mk("p2"), mk("p1")],
        activePromotionIds: new Set(["p1", "p2"]),
      }).promotedIdsOnPage;
    expect(run()).toEqual(["p2"]);
    expect(run()).toEqual(run());
  });

  it("B-D2: 1페이지에 고정된 글이 다음 페이지 일반 목록에 와도, 화면이 붙일 때 id 로 걸러 한 번만 보인다", () => {
    const page0 = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("a"), mk("b")],
      promotedPosts: [mk("p1")],
      activePromotionIds: new Set(["p1"]),
    });
    const page1 = projectTradeFeedWithPromotions({
      pageIndex: 1,
      normalPosts: [mk("c"), mk("p1"), mk("d")],
      promotedPosts: [mk("p1")],
      activePromotionIds: new Set(["p1"]),
    });
    // HomeProductList·PostListByCategory 의 붙이기 규칙과 같다: 이미 본 id 는 붙이지 않는다
    const seen = new Set(page0.posts.map((p) => p.id));
    const appended = [...page0.posts, ...page1.posts.filter((p) => !seen.has(p.id))];
    const ids = appended.map((p) => p.id);
    expect(ids).toEqual(["a", "p1", "b", "c", "d"]);
    expect(ids.filter((id) => id === "p1")).toHaveLength(1);
  });

  it("page0 interleaves a single promo after the first organic row", () => {
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("a"), mk("b"), mk("promo")],
      promotedPosts: [mk("promo")],
      activePromotionIds: new Set(["promo"]),
    });
    const ids = posts.map((p) => p.id);
    expect(ids[0]).toBe("a");
    expect(ids).toContain("promo");
    expect(ids).toContain("b");
    expect(ids.filter((id) => id === "promo")).toHaveLength(1);
    expect(promotedIdsOnPage).toEqual(["promo"]);
  });

  it("page>0 passes the organic page through (list screens dedupe ids on append)", () => {
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 1,
      normalPosts: [mk("promo"), mk("c")],
      promotedPosts: [],
      activePromotionIds: new Set(["promo"]),
    });
    expect(posts.map((p) => p.id)).toEqual(["promo", "c"]);
    expect(promotedIdsOnPage).toEqual([]);
  });

  it("P-2: >1 active entitlements — page0 pins 1, unselected stay as organic rows on page0", () => {
    const promoted = ["p1", "p2", "p3", "p4", "p5"].map((id) => mk(id));
    const active = new Set(promoted.map((p) => p.id));
    const page0 = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("a"), ...promoted],
      promotedPosts: promoted,
      activePromotionIds: active,
    });
    const ids = page0.posts.map((p) => p.id);
    expect(page0.promotedIdsOnPage).toEqual(["p1"]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of active) expect(ids).toContain(id);
  });

  it("P-2: sold promoted post stays in the organic list (sold section)", () => {
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("a"), { ...mk("sold1"), status: "sold" }],
      promotedPosts: [{ ...mk("sold1"), status: "sold" }],
      activePromotionIds: new Set(["sold1"]),
    });
    expect(promotedIdsOnPage).toEqual([]);
    expect(posts.map((p) => p.id)).toEqual(["a", "sold1"]);
  });

  it("P-3: sold tab pins nothing and keeps promoted rows organic", () => {
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("s1"), mk("promo")],
      promotedPosts: [mk("promo")],
      activePromotionIds: new Set(["promo"]),
      pinFilter: { tradeState: "sold" },
    });
    expect(promotedIdsOnPage).toEqual([]);
    expect(posts.map((p) => p.id)).toEqual(["s1", "promo"]);
  });

  it("Owner 2026-11-05 지역 제한 해제: 보는 회원 지역(Pasig·Manila·QC)이 달라도 같은 광고 1건이 두 번째 칸", () => {
    const post = (id: string, lgu: string) => ({ ...mk(id), trade_lgu_id: lgu, region: lgu, city: lgu }) as PostWithMeta;
    // 가장 최근 결제 광고 글은 Pasig 글 — 보는 회원 목록이 어느 지역이든 같은 글이 끼워진다
    const promotedPosts = [post("p-pasig", "1381200000"), post("p-manila", "1380600000")];
    const active = new Set(["p-pasig", "p-manila"]);
    const viewers: Record<string, PostWithMeta[]> = {
      pasig: [post("n1", "1381200000"), post("n2", "1381200000")],
      manila: [post("m1", "1380600000"), post("m2", "1380600000")],
      qc: [post("q1", "1381300000"), post("q2", "1381300000")],
    };
    for (const normalPosts of Object.values(viewers)) {
      const { promotedIdsOnPage, posts } = projectTradeFeedWithPromotions({
        pageIndex: 0,
        normalPosts,
        promotedPosts,
        activePromotionIds: active,
        pinFilter: { tradeState: "all" },
      });
      expect(promotedIdsOnPage).toEqual(["p-pasig"]);
      expect(posts[0]!.id).toBe(normalPosts[0]!.id);
      expect(posts[1]!.id).toBe("p-pasig");
      const ids = posts.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("Owner 2026-11-05: 끼운 광고 글이 같은 1페이지 일반 목록에도 있으면 한 번만(일반 자리에서 빠진다)", () => {
    const { posts } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("a"), mk("b"), mk("p1"), mk("c")],
      promotedPosts: [mk("p1"), mk("p2")],
      activePromotionIds: new Set(["p1", "p2"]),
    });
    expect(posts.map((p) => p.id)).toEqual(["a", "p1", "b", "c"]);
  });

  it("Owner 2026-11-05: 광고가 끝나면 그 글은 일반 자리 한 번만(끼우지 않음)", () => {
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("a"), mk("ended"), mk("b")],
      promotedPosts: [mk("ended")],
      activePromotionIds: new Set(),
    });
    expect(promotedIdsOnPage).toEqual([]);
    expect(posts.map((p) => p.id)).toEqual(["a", "ended", "b"]);
  });

  it("재감사: pinned rows take the first organic row's list_section so the next divider is not skipped", () => {
    const { posts } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [{ ...mk("a"), list_section: "cat:similar" } as PostWithMeta, { ...mk("b"), list_section: "cat:other" } as PostWithMeta],
      promotedPosts: [mk("p1")],
      activePromotionIds: new Set(["p1"]),
    });
    expect(posts.map((p) => [p.id, p.list_section])).toEqual([
      ["a", "cat:similar"],
      ["p1", "cat:similar"],
      ["b", "cat:other"],
    ]);
  });

  it("P-3: price range pins only promoted posts inside the range", () => {
    const { promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("a")],
      promotedPosts: [
        { ...mk("cheap"), price: 100 } as PostWithMeta,
        { ...mk("inside"), price: 500 } as PostWithMeta,
        { ...mk("noprice") } as PostWithMeta,
      ],
      activePromotionIds: new Set(["cheap", "inside", "noprice"]),
      pinFilter: { tradeState: "all", priceMin: 300, priceMax: 1000 },
    });
    expect(promotedIdsOnPage).toEqual(["inside"]);
  });

  it("page=1 caps to organicPageSize = organic_capped + selected (not 20+1 dump)", () => {
    const organic = Array.from({ length: 20 }, (_, i) => mk(`o${i}`));
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: organic,
      promotedPosts: [mk("p1"), mk("p2"), mk("p3")],
      activePromotionIds: new Set(["p1", "p2", "p3"]),
      organicPageSize: 20,
    });
    expect(promotedIdsOnPage).toEqual(["p1"]);
    expect(posts).toHaveLength(20);
    expect(new Set(posts.map((p) => p.id)).size).toBe(20);
    expect(posts.filter((p) => promotedIdsOnPage.includes(p.id))).toHaveLength(1);
    expect(posts.map((p) => p.id)).not.toContain("p2");
  });

  it("does not duplicate a promo id that is also in the organic window", () => {
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("a"), mk("promo"), mk("b")],
      promotedPosts: [mk("promo")],
      activePromotionIds: new Set(["promo"]),
    });
    expect(posts.filter((p) => p.id === "promo")).toHaveLength(1);
    expect(promotedIdsOnPage).toEqual(["promo"]);
  });

  it("sold/hidden/deleted entitlements never enter the mixed page", () => {
    const { posts, promotedIdsOnPage } = projectTradeFeedWithPromotions({
      pageIndex: 0,
      normalPosts: [mk("a"), mk("b")],
      promotedPosts: [
        { ...mk("sold1"), status: "sold" },
        { ...mk("hid1"), status: "hidden" },
        mk("ok1"),
      ],
      activePromotionIds: new Set(["sold1", "hid1", "ok1"]),
    });
    expect(promotedIdsOnPage).toEqual(["ok1"]);
    expect(posts.map((p) => p.id)).not.toContain("sold1");
    expect(posts.map((p) => p.id)).not.toContain("hid1");
    expect(posts.map((p) => p.id)).toContain("ok1");
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

  it("LIST page=1 (q none) pins at most 1, badges only that row, duplicate id 0", () => {
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
    expect(ids[0]).not.toBe(promotedIdsOnPage[0]);
    expect(ids[0]).toBe("a");
    expect(ids[1]).toBe("p1");
    expect(promotedIdsOnPage).toEqual(["p1"]);
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
