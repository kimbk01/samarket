import { describe, expect, it } from "vitest";
import {
  compareStoreDiscoveryBrowseRows,
  sortStoreDiscoveryBrowseRows,
  type StoreDiscoverySortContext,
} from "@/lib/stores/store-discovery-browse-sort";

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

function ctx(overrides: Partial<StoreDiscoverySortContext> = {}): StoreDiscoverySortContext {
  return {
    district: null,
    sort: "default",
    eligibilityRankById: new Map([
      ["a", 0],
      ["b", 0],
      ["c", 1],
      ["d", 5],
    ]),
    distanceKmById: new Map([
      ["a", 1],
      ["b", 3],
      ["c", 0.5],
      ["d", 0.2],
    ]),
    outOfRangeById: new Map([
      ["a", false],
      ["b", false],
      ["c", false],
      ["d", false],
    ]),
    hasGeo: true,
    ...overrides,
  };
}

describe("store-discovery-browse-sort", () => {
  it("default: eligibility before distance", () => {
    const rows = [row({ id: "c" }), row({ id: "a" })];
    const sorted = sortStoreDiscoveryBrowseRows(rows, ctx());
    expect(sorted.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("distance sort uses server distance after eligibility", () => {
    const rows = [row({ id: "b" }), row({ id: "a" })];
    const sorted = sortStoreDiscoveryBrowseRows(rows, ctx({ sort: "distance" }));
    expect(sorted.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("rating sort: null ratings after rated stores", () => {
    const ratingCtx = ctx({
      sort: "rating",
      eligibilityRankById: new Map([
        ["hi", 0],
        ["none", 0],
      ]),
      distanceKmById: new Map(),
      outOfRangeById: new Map(),
      hasGeo: false,
    });
    const rows = [
      row({ id: "none", rating_avg: null, review_count: 0 }),
      row({ id: "hi", rating_avg: 4.3, review_count: 65 }),
    ];
    const sorted = sortStoreDiscoveryBrowseRows(rows, ratingCtx);
    expect(sorted.map((r) => r.id)).toEqual(["hi", "none"]);
  });

  it("reviews sort: higher count first", () => {
    const reviewsCtx = ctx({
      sort: "reviews",
      eligibilityRankById: new Map([
        ["jtv", 0],
        ["other", 0],
      ]),
      distanceKmById: new Map(),
      outOfRangeById: new Map(),
      hasGeo: false,
    });
    const rows = [
      row({ id: "other", rating_avg: 5, review_count: 3 }),
      row({ id: "jtv", rating_avg: 4.37, review_count: 65 }),
    ];
    const sorted = sortStoreDiscoveryBrowseRows(rows, reviewsCtx);
    expect(sorted.map((r) => r.id)).toEqual(["jtv", "other"]);
  });

  it("pagination slice is stable for same comparator", () => {
    const all = [
      row({ id: "s3", slug: "c" }),
      row({ id: "s1", slug: "a" }),
      row({ id: "s2", slug: "b" }),
      row({ id: "s4", slug: "d" }),
    ];
    const c = ctx({
      eligibilityRankById: new Map(all.map((r) => [r.id, 0])),
      distanceKmById: new Map(all.map((r, i) => [r.id, i + 1])),
      hasGeo: true,
    });
    const sorted = sortStoreDiscoveryBrowseRows(all, c);
    const page1 = sorted.slice(0, 2);
    const page2 = sorted.slice(2, 4);
    const ids = [...page1, ...page2].map((r) => r.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual(sorted.map((r) => r.id));
    expect(compareStoreDiscoveryBrowseRows(c, page1[0], page1[1])).toBeLessThanOrEqual(0);
  });
});
