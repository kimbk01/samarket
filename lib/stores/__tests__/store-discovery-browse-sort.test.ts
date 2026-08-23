import { describe, expect, it } from "vitest";
import {
  compareStoreDiscoveryBrowseRows,
  parseStoreBrowseServerSortParam,
  resolveStoreBrowseSortedByMeta,
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


describe("store-discovery-browse-sort fast", () => {
  it("parseStoreBrowseServerSortParam accepts fast", () => {
    expect(parseStoreBrowseServerSortParam("fast")).toBe("fast");
    expect(parseStoreBrowseServerSortParam("FAST")).toBe("fast");
  });

  it("resolveStoreBrowseSortedByMeta for fast", () => {
    expect(resolveStoreBrowseSortedByMeta("fast", false)).toBe("eligibility_prep");
  });

  it("prep 10 before 20; missing after configured; label-only is UNKNOWN", () => {
    const eligibilityRankById = new Map([
      ["ten", 0],
      ["twenty", 0],
      ["missing", 0],
      ["labelOnly", 0],
    ]);
    const explicitPrepMinutesById = new Map<string, number | null>([
      ["ten", 10],
      ["twenty", 20],
      ["missing", null],
      // label-only stores must not appear as configured — omit or null
      ["labelOnly", null],
    ]);
    const sorted = sortStoreDiscoveryBrowseRows(
      [
        row({ id: "missing", slug: "m" }),
        row({ id: "twenty", slug: "t20" }),
        row({ id: "labelOnly", slug: "lbl" }),
        row({ id: "ten", slug: "t10" }),
      ],
      ctx({
        sort: "fast",
        eligibilityRankById,
        explicitPrepMinutesById,
        hasGeo: false,
        distanceKmById: null,
        outOfRangeById: null,
      })
    );
    expect(sorted.map((r) => r.id)).toEqual(["ten", "twenty", "labelOnly", "missing"]);
  });

  it("explicit raw prep ignores est_prep_label contamination in map", () => {
    // Map must carry raw explicit minutes only (builder uses readExplicitStorePrepTimeMinutes).
    const eligibilityRankById = new Map([
      ["a", 0],
      ["b", 0],
    ]);
    const sorted = sortStoreDiscoveryBrowseRows(
      [row({ id: "b", slug: "b" }), row({ id: "a", slug: "a" })],
      ctx({
        sort: "fast",
        eligibilityRankById,
        explicitPrepMinutesById: new Map([
          ["a", 15],
          ["b", 30],
        ]),
        hasGeo: false,
        distanceKmById: null,
        outOfRangeById: null,
      })
    );
    expect(sorted.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("eligibility still precedes prep", () => {
    const eligibilityRankById = new Map([
      ["openSlow", 0],
      ["closedFast", 2],
    ]);
    const sorted = sortStoreDiscoveryBrowseRows(
      [row({ id: "closedFast", slug: "c" }), row({ id: "openSlow", slug: "o" })],
      ctx({
        sort: "fast",
        eligibilityRankById,
        explicitPrepMinutesById: new Map([
          ["openSlow", 40],
          ["closedFast", 5],
        ]),
        hasGeo: false,
        distanceKmById: null,
        outOfRangeById: null,
      })
    );
    expect(sorted.map((r) => r.id)).toEqual(["openSlow", "closedFast"]);
  });

  it("missing vs missing uses stable slug tie-break", () => {
    const eligibilityRankById = new Map([
      ["b", 0],
      ["a", 0],
    ]);
    const sorted = sortStoreDiscoveryBrowseRows(
      [row({ id: "b", slug: "b-store" }), row({ id: "a", slug: "a-store" })],
      ctx({
        sort: "fast",
        eligibilityRankById,
        explicitPrepMinutesById: new Map([
          ["a", null],
          ["b", null],
        ]),
        hasGeo: false,
        distanceKmById: null,
        outOfRangeById: null,
      })
    );
    expect(sorted.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
