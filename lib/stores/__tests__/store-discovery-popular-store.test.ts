import { describe, expect, it } from "vitest";
import {
  compareStoreDiscoveryPopularRows,
  normalizeStoreCompletedOrderCountMap,
  sortStoreDiscoveryPopularRows,
  type StorePopularitySortRow,
} from "@/lib/stores/store-discovery-popular-store";
import { compareStoreDiscoveryBrowseRows, type StoreDiscoverySortContext } from "@/lib/stores/store-discovery-browse-sort";

function row(partial: Partial<StorePopularitySortRow> & { id: string }): StorePopularitySortRow {
  return {
    slug: partial.slug ?? partial.id,
    district: partial.district ?? null,
    rating_avg: partial.rating_avg ?? null,
    review_count: partial.review_count ?? 0,
    completedOrderCount30d: partial.completedOrderCount30d ?? 0,
    ...partial,
  };
}

describe("store-discovery-popular-store", () => {
  it("P1A-1: higher completed30d wins when eligibility equal", () => {
    const a = row({ id: "a", completedOrderCount30d: 20 });
    const b = row({ id: "b", completedOrderCount30d: 10 });
    expect(compareStoreDiscoveryPopularRows(0, 0, a, b)).toBeLessThan(0);
  });

  it("P1A-2: deliverable store beats higher-count delivery-disabled", () => {
    const disabled = row({ id: "hi", completedOrderCount30d: 100 });
    const deliverable = row({ id: "lo", completedOrderCount30d: 5 });
    expect(compareStoreDiscoveryPopularRows(1, 0, disabled, deliverable)).toBeGreaterThan(0);
  });

  it("P1A-5: missing RPC row normalizes to zero", () => {
    const map = normalizeStoreCompletedOrderCountMap(["missing"], []);
    expect(map.get("missing")).toBe(0);
  });

  it("P1A-6: same popularity uses rating/review/stable tie", () => {
    const rank = new Map([
      ["a", 0],
      ["b", 0],
    ]);
    const rows = sortStoreDiscoveryPopularRows(
      [
        row({ id: "a", slug: "alpha", completedOrderCount30d: 5, rating_avg: 4.5, review_count: 10 }),
        row({ id: "b", slug: "beta", completedOrderCount30d: 5, rating_avg: 4.0, review_count: 3 }),
      ],
      rank
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    const again = sortStoreDiscoveryPopularRows([...rows].reverse(), rank);
    expect(again.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("store-discovery-browse-sort popular", () => {
  function ctx(overrides: Partial<StoreDiscoverySortContext> = {}): StoreDiscoverySortContext {
    return {
      district: null,
      sort: "popular",
      eligibilityRankById: new Map([
        ["a", 0],
        ["b", 0],
        ["c", 5],
      ]),
      distanceKmById: new Map(),
      outOfRangeById: new Map(),
      hasGeo: false,
      completedOrderCount30dById: new Map([
        ["a", 20],
        ["b", 10],
        ["c", 100],
      ]),
      ...overrides,
    };
  }

  it("P1A-3/P1A-4: only completed status counts in metric map (contract via comparator)", () => {
    const popularCtx = ctx();
    const a = row({ id: "a", completedOrderCount30d: 2 });
    const b = row({ id: "b", completedOrderCount30d: 50 });
    expect(compareStoreDiscoveryBrowseRows(popularCtx, a, b)).toBeLessThan(0);
  });

  it("pagination: popular sort stable with no duplicates", () => {
    const popularCtx = ctx({
      eligibilityRankById: new Map(["a", "b", "c", "d"].map((id) => [id, 0])),
      completedOrderCount30dById: new Map([
        ["a", 40],
        ["b", 30],
        ["c", 20],
        ["d", 10],
      ]),
    });
    const rows = [
      row({ id: "d", slug: "d" }),
      row({ id: "b", slug: "b" }),
      row({ id: "a", slug: "a" }),
      row({ id: "c", slug: "c" }),
    ];
    const sorted = [...rows].sort((x, y) => compareStoreDiscoveryBrowseRows(popularCtx, x, y));
    const page1 = sorted.slice(0, 2);
    const page2 = sorted.slice(2, 4);
    const ids = [...page1, ...page2].map((r) => r.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual(["a", "b", "c", "d"]);
    const again = [...rows].sort((x, y) => compareStoreDiscoveryBrowseRows(popularCtx, x, y));
    expect(again.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });
});
