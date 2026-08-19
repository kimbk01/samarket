import { describe, expect, it } from "vitest";
import { applyMarketplaceQueryToPostgrest } from "@/lib/trade/marketplace/query-contract";
import {
  listingMatchesRootBoost,
  resolveMarketplaceSearchIntent,
} from "@/lib/trade/marketplace/search-intent-resolver";
import {
  MARKETPLACE_DISCOVERY_POOL_BATCH,
  rankMarketplaceDiscoveryBatch,
} from "@/lib/trade/marketplace/marketplace-discovery-rank";
import { resolveHardMembershipCategoryIds } from "@/lib/trade/marketplace/resolve-marketplace-membership";
import { resolveTradeFeedLocationConstraint } from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import {
  filterPostsOutsideBrowseAnchor,
  filterPostsWithinBrowseAnchor,
} from "@/lib/trade/location/national/trade-feed-location-sql-extras";
import { emptySearchExpansionCursor } from "@/lib/trade/marketplace/search-candidate-expansion";
import {
  resetSearchRankedWindowCacheForTests,
  takeSearchRankedWindowPage,
} from "@/lib/trade/marketplace/search-ranked-window-cache";

const PASAY_SLUG = "pasay";
const MAKATI_CANONICAL = "1380300000";
const DAVAO_CANONICAL = "1130700000";
const USED_CAR_ROOT = "50feae02-9fb9-4b59-8ab7-7e43a0f5c407";
const EXCHANGE_ROOT = "fa4af727-ec64-466e-b164-42368b839daf";
const USED_CAR_CHILD = "used-car-child-1";
const EXCHANGE_CHILD = "exchange-child-1";
const GENERAL_CHILD = "general-child-1";

const HOME_ROOTS = [
  { id: USED_CAR_ROOT, name: "중고차", name_en: "Used Car", slug: "used-car" },
  { id: EXCHANGE_ROOT, name: "환전", name_en: "Exchange", slug: "exchange" },
];

function pasayConstraint(radiusKm: number | null = null) {
  const c = resolveTradeFeedLocationConstraint(PASAY_SLUG, radiusKm);
  if (c.kind !== "lgu") throw new Error(`expected lgu constraint for ${PASAY_SLUG}`);
  return c;
}

function intentFor(q: string) {
  return resolveMarketplaceSearchIntent({ q, homeRoots: HOME_ROOTS })!;
}

describe("SEARCH-LOCATION-FRESH-1", () => {
  describe("S1 inferred ROOT", () => {
    it("q=중고차 resolves used-car ROOT boost without membership wall", () => {
      const intent = intentFor("중고차");
      expect(intent.rootBoostParentIds).toContain(USED_CAR_ROOT);
      expect(intent.resolved).toBe(true);

      const rootExpanded = {
        [USED_CAR_ROOT]: [USED_CAR_CHILD],
        [EXCHANGE_ROOT]: [EXCHANGE_CHILD],
      };

      const rows = [
        { id: "car1", trade_category_id: USED_CAR_CHILD, title: "Toyota Vios", trade_lgu_id: MAKATI_CANONICAL },
        { id: "gen1", trade_category_id: GENERAL_CHILD, title: "Desk lamp", trade_lgu_id: MAKATI_CANONICAL },
      ];

      const ranked = rankMarketplaceDiscoveryBatch({
        rows,
        intent,
        rootExpandedIdsByParent: rootExpanded,
        feedConstraint: { kind: "all" },
      });

      expect(ranked[0]?.id).toBe("car1");
      expect(ranked.some((r) => r.id === "gen1")).toBe(true);
    });
  });

  describe("S2 unresolved", () => {
    it("q=asdfxyz keeps eligible continuation (no forced empty band)", () => {
      const intent = intentFor("asdfxyz");
      expect(intent.resolved).toBe(false);

      const rows = [
        { id: "a", trade_category_id: GENERAL_CHILD, title: "Chair", trade_lgu_id: MAKATI_CANONICAL },
        { id: "b", trade_category_id: GENERAL_CHILD, title: "Table", trade_lgu_id: pasayConstraint().canonicalId },
      ];

      const ranked = rankMarketplaceDiscoveryBatch({
        rows,
        intent,
        rootExpandedIdsByParent: {},
        feedConstraint: { kind: "all" },
      });

      expect(ranked.map((r) => r.id)).toEqual(["a", "b"]);
    });
  });

  describe("L1 location soft", () => {
    it("Pasay anchor prefers local used-car then outside tail", () => {
      const intent = intentFor("중고차");
      const constraint = pasayConstraint(null);
      const rootExpanded = { [USED_CAR_ROOT]: [USED_CAR_CHILD] };
      const pasayId = constraint.canonicalId;

      const rows = [
        { id: "far-car", trade_category_id: USED_CAR_CHILD, title: "Honda", trade_lgu_id: MAKATI_CANONICAL },
        { id: "near-car", trade_category_id: USED_CAR_CHILD, title: "Mitsubishi", trade_lgu_id: pasayId },
        { id: "far-gen", trade_category_id: GENERAL_CHILD, title: "Lamp", trade_lgu_id: MAKATI_CANONICAL },
      ];

      const ranked = rankMarketplaceDiscoveryBatch({
        rows,
        intent,
        rootExpandedIdsByParent: rootExpanded,
        feedConstraint: constraint,
      });

      expect(ranked[0]?.id).toBe("near-car");
      expect(ranked.some((r) => r.id === "far-car")).toBe(true);
      expect(ranked.some((r) => r.id === "far-gen")).toBe(true);
    });
  });

  describe("L2 radius soft", () => {
    it("5km preference keeps outside eligible tail", () => {
      const intent = intentFor("중고차");
      const constraint = pasayConstraint(5);
      const rootExpanded = { [USED_CAR_ROOT]: [USED_CAR_CHILD] };
      const pasayId = constraint.canonicalId;

      const within = filterPostsWithinBrowseAnchor(
        [{ id: "in", trade_lgu_id: pasayId }],
        constraint
      );
      const outside = filterPostsOutsideBrowseAnchor(
        [{ id: "out", trade_lgu_id: DAVAO_CANONICAL }],
        constraint
      );
      expect(within.length).toBe(1);
      expect(outside.length).toBe(1);

      const rows = [
        { id: "in", trade_category_id: USED_CAR_CHILD, trade_lgu_id: pasayId },
        { id: "out", trade_category_id: USED_CAR_CHILD, trade_lgu_id: DAVAO_CANONICAL },
      ];

      const ranked = rankMarketplaceDiscoveryBatch({
        rows,
        intent,
        rootExpandedIdsByParent: rootExpanded,
        feedConstraint: constraint,
      });

      expect(ranked[0]?.id).toBe("in");
      expect(ranked.some((r) => r.id === "out")).toBe(true);
    });

    it.each([10, 30, 64] as const)("radius=%skm keeps nationwide outside in ranked output", (radiusKm) => {
      const intent = intentFor("중고차");
      const constraint = pasayConstraint(radiusKm);
      const pasayId = constraint.canonicalId;
      const ranked = rankMarketplaceDiscoveryBatch({
        rows: [
          { id: "near", trade_category_id: USED_CAR_CHILD, trade_lgu_id: pasayId },
          { id: "far", trade_category_id: USED_CAR_CHILD, trade_lgu_id: DAVAO_CANONICAL },
        ],
        intent,
        rootExpandedIdsByParent: { [USED_CAR_ROOT]: [USED_CAR_CHILD] },
        feedConstraint: constraint,
      });
      expect(ranked.map((r) => r.id)).toEqual(["near", "far"]);
    });
  });

  describe("C1 explicit category M-HARD", () => {
    it("explicit used-car membership excludes exchange ids", () => {
      const membership = resolveHardMembershipCategoryIds({
        rootExpandedIds: [USED_CAR_CHILD],
        topicExpandedIds: null,
      });
      expect(membership).toContain(USED_CAR_CHILD);
      expect(membership).not.toContain(EXCHANGE_CHILD);
    });
  });

  describe("F1 hard price filter", () => {
    it("price bounds remain hard filter authority (not ranking-only)", () => {
      const calls: string[] = [];
      const mockQ = {
        ilike: (col: string, pat: string) => {
          calls.push(`ilike:${col}:${pat}`);
          return mockQ;
        },
        gte: (col: string, val: number) => {
          calls.push(`gte:${col}:${val}`);
          return mockQ;
        },
        lte: () => mockQ,
      };
      applyMarketplaceQueryToPostgrest(mockQ, { q: "중고차", priceMin: 1000 });
      expect(calls.some((c) => c.startsWith("gte:price:"))).toBe(true);
      expect(calls.some((c) => c.startsWith("ilike:title:"))).toBe(true);
    });
  });

  describe("P1 pagination continuation", () => {
    it("ranked window continues through eligible tail batches", async () => {
      resetSearchRankedWindowCacheForTests();
      let batch = 0;
      const page = await takeSearchRankedWindowPage({
        key: "fresh1:pagination",
        page: 1,
        pageSize: 2,
        loadNext: async (cursor) => {
          batch += 1;
          if (batch === 1) {
            return {
              posts: [{ id: "1" }, { id: "2" }],
              cursor: {
                ...cursor,
                exactExhausted: true,
                relatedInExhausted: true,
                relatedOutExhausted: true,
                tailOffset: MARKETPLACE_DISCOVERY_POOL_BATCH,
                tailExhausted: false,
                seenIds: ["1", "2"],
              },
              queryCount: 1,
            };
          }
          return {
            posts: [{ id: "3" }],
            cursor: {
              ...emptySearchExpansionCursor(),
              exactExhausted: true,
              relatedInExhausted: true,
              relatedOutExhausted: true,
              tailExhausted: true,
              seenIds: ["1", "2", "3"],
            },
            queryCount: 1,
          };
        },
      });
      expect(page?.posts.map((p) => p.id)).toEqual(["1", "2"]);
      expect(page?.hasMore).toBe(true);
    });
  });

  describe("ROOT scoring helper", () => {
    it("listingMatchesRootBoost uses expanded ids only for score", () => {
      expect(
        listingMatchesRootBoost(USED_CAR_CHILD, [USED_CAR_ROOT], {
          [USED_CAR_ROOT]: [USED_CAR_CHILD],
        })
      ).toBe(true);
      expect(
        listingMatchesRootBoost(EXCHANGE_CHILD, [USED_CAR_ROOT], {
          [USED_CAR_ROOT]: [USED_CAR_CHILD],
        })
      ).toBe(false);
    });
  });
});
