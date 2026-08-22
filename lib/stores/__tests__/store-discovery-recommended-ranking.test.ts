import { describe, expect, it } from "vitest";
import {
  compareStoreDiscoveryRecommendedRows,
  type StoreDiscoveryRecommendedContext,
} from "@/lib/stores/store-discovery-recommended-ranking";
import { sortStoreDiscoveryHomeFeedRows } from "@/lib/stores/store-discovery-browse-sort";
import { sortStoreDiscoveryBrowseRows } from "@/lib/stores/store-discovery-browse-sort";

type Row = {
  id: string;
  slug: string;
  district: string | null;
  rating_avg: number | null;
  review_count: number | null;
};

function row(partial: Partial<Row> & { id: string }): Row {
  return {
    slug: partial.slug ?? partial.id,
    district: partial.district ?? null,
    rating_avg: partial.rating_avg ?? null,
    review_count: partial.review_count ?? 0,
    ...partial,
  };
}

function recommendedCtx(
  overrides: Partial<StoreDiscoveryRecommendedContext> = {}
): StoreDiscoveryRecommendedContext {
  return {
    district: null,
    eligibilityRankById: new Map([
      ["a", 0],
      ["b", 0],
    ]),
    distanceKmById: new Map([
      ["a", 1],
      ["b", 1],
    ]),
    outOfRangeById: new Map([
      ["a", false],
      ["b", false],
    ]),
    hasGeo: true,
    completedOrderCount30dById: new Map([
      ["a", 10],
      ["b", 2],
    ]),
    completedOrderCountStatus: "ok",
    ...overrides,
  };
}

describe("store-discovery-recommended-ranking CUT1", () => {
  it("R1: same location band — higher orders beats higher rating", () => {
    const a = row({ id: "a", rating_avg: 4.5 });
    const b = row({ id: "b", rating_avg: 5.0 });
    expect(compareStoreDiscoveryRecommendedRows(recommendedCtx(), a, b)).toBeLessThan(0);
  });

  it("R2: open+deliverable with low orders beats closed with high orders", () => {
    const open = row({ id: "open", rating_avg: 4 });
    const closed = row({ id: "closed", rating_avg: 4 });
    const ctx = recommendedCtx({
      eligibilityRankById: new Map([
        ["open", 0],
        ["closed", 5],
      ]),
      completedOrderCount30dById: new Map([
        ["open", 2],
        ["closed", 100],
      ]),
    });
    expect(compareStoreDiscoveryRecommendedRows(ctx, open, closed)).toBeLessThan(0);
  });

  it("R3: HOME and BROWSE default share same comparator on identical rows", () => {
    const rows = [
      row({ id: "x", slug: "x", rating_avg: 4.2, review_count: 10 }),
      row({ id: "y", slug: "y", rating_avg: 4.8, review_count: 3 }),
      row({ id: "z", slug: "z", rating_avg: 4.0, review_count: 50 }),
    ];
    const homeCtx = {
      district: null,
      eligibilityRankById: new Map(rows.map((r) => [r.id, 0])),
      distanceKmById: new Map(rows.map((r) => [r.id, 2])),
      outOfRangeById: new Map(rows.map((r) => [r.id, false])),
      hasGeo: true,
      completedOrderCount30dById: new Map([
        ["x", 5],
        ["y", 20],
        ["z", 20],
      ]),
      completedOrderCountStatus: "ok" as const,
    };
    const browseCtx = {
      ...homeCtx,
      sort: "default" as const,
    };

    const homeSorted = sortStoreDiscoveryHomeFeedRows(rows, homeCtx);
    const browseSorted = sortStoreDiscoveryBrowseRows(rows, browseCtx);
    expect(homeSorted.map((r) => r.id)).toEqual(browseSorted.map((r) => r.id));
  });

  it("R5: RPC error skips order signal — does not treat as zero-order tie-break", () => {
    const hi = row({ id: "hi", rating_avg: 4.0 });
    const lo = row({ id: "lo", rating_avg: 5.0 });
    const ctx = recommendedCtx({
      completedOrderCount30dById: new Map([
        ["hi", 100],
        ["lo", 0],
      ]),
      completedOrderCountStatus: "error",
    });
    // Without orders signal, higher rating wins
    expect(compareStoreDiscoveryRecommendedRows(ctx, hi, lo)).toBeGreaterThan(0);
  });
});
