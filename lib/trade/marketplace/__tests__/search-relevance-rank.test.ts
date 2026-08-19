import { describe, expect, it } from "vitest";
import {
  assembleSearchExpansionRound,
  advanceSearchExpansionCursor,
  buildSearchExpansionRelatedOrFilter,
  classifySearchExpansionTier,
  emptySearchExpansionCursor,
  resolveSearchExpansionHints,
  searchExpansionSourcesExhausted,
  shouldApplyMarketplaceSearchExpansion,
} from "@/lib/trade/marketplace/search-candidate-expansion";
import {
  buildSearchRankedWindowCacheKey,
  resetSearchRankedWindowCacheForTests,
  takeSearchRankedWindowPage,
} from "@/lib/trade/marketplace/search-ranked-window-cache";
import { marketplaceQueryCacheSegment } from "@/lib/trade/marketplace/query-contract";
import { compositionFilterCacheSegment } from "@/lib/trade/category-form/composition-filter-query";

const PASIG = "1381200000";
const DAVAO = "1130700000";

describe("CUT C search candidate expansion", () => {
  it("applies when q is set regardless of sort", () => {
    expect(shouldApplyMarketplaceSearchExpansion({ q: "fortuner", sort: "latest" })).toBe(true);
    expect(shouldApplyMarketplaceSearchExpansion({ q: "fortuner", sort: "newest" })).toBe(true);
    expect(shouldApplyMarketplaceSearchExpansion({ q: "fortuner", sort: "distance" })).toBe(true);
    expect(shouldApplyMarketplaceSearchExpansion({ q: "fortuner", sort: "popular" })).toBe(true);
    expect(shouldApplyMarketplaceSearchExpansion({ q: "  ", sort: "latest" })).toBe(false);
  });

  it("maps Toyota Fortuner to make/model catalog hints", () => {
    const hints = resolveSearchExpansionHints("Toyota Fortuner");
    expect(hints?.makes).toContain("toyota");
    expect(hints?.models).toContain("fortuner");
    const relatedOr = buildSearchExpansionRelatedOrFilter(hints!);
    expect(relatedOr).toContain("title.ilike.%toyota%");
    expect(relatedOr).toContain("meta->>car_model.ilike.%fortuner%");
  });

  it("lets attribute-only Fortuner into T2 without title phrase", () => {
    const hints = resolveSearchExpansionHints("Toyota Fortuner")!;
    expect(
      classifySearchExpansionTier(
        { title: "Diesel 2022", meta: { car_model: "Toyota Fortuner" }, trade_lgu_id: PASIG },
        hints,
        PASIG
      )
    ).toBe(2);
  });

  it("does not classify unrelated rows into T1–T4 but accepts them in tail (T5)", () => {
    const hints = resolveSearchExpansionHints("Toyota Fortuner")!;
    expect(
      classifySearchExpansionTier(
        { title: "Samsung fridge", meta: {}, trade_lgu_id: PASIG },
        hints,
        PASIG
      )
    ).toBeNull();
    const assembled = assembleSearchExpansionRound({
      exactRows: [],
      relatedInRows: [],
      relatedOutRows: [],
      tailRows: [
        {
          id: "fridge",
          title: "Samsung fridge",
          meta: {},
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T10:00:00.000Z",
        },
      ],
      hints,
      browseLguCanonicalId: PASIG,
      cursor: emptySearchExpansionCursor(),
    });
    expect(assembled.posts.map((row) => row.id)).toEqual(["fridge"]);
  });

  it("puts same-location SUV leftover in T3 after exact Fortuner infers body_type", () => {
    const hints = resolveSearchExpansionHints("Toyota Fortuner")!;
    expect(
      classifySearchExpansionTier(
        { title: "Montero Sport", meta: { car_body_type: "suv" }, trade_lgu_id: PASIG },
        hints,
        PASIG,
        ["suv"]
      )
    ).toBe(3);
    expect(
      classifySearchExpansionTier(
        { title: "Montero Sport", meta: { car_body_type: "suv" }, trade_lgu_id: DAVAO },
        hints,
        PASIG,
        ["suv"]
      )
    ).toBe(4);
  });

  it("assembles T1 before T2 before T3 before T4 without duplicate ids", () => {
    const hints = resolveSearchExpansionHints("Toyota Fortuner")!;
    const assembled = assembleSearchExpansionRound({
      exactRows: [
        {
          id: "exact",
          title: "Toyota Fortuner",
          meta: { car_body_type: "suv" },
          trade_lgu_id: DAVAO,
          created_at: "2026-08-18T10:00:00.000Z",
        },
      ],
      relatedInRows: [
        {
          id: "local-suv",
          title: "Montero Sport",
          meta: { car_body_type: "suv" },
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T11:00:00.000Z",
        },
        {
          id: "token",
          title: "Fortuner 2022 Diesel",
          meta: { car_model: "Toyota Fortuner" },
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T09:00:00.000Z",
        },
        {
          id: "exact",
          title: "Toyota Fortuner",
          meta: { car_body_type: "suv" },
          trade_lgu_id: DAVAO,
          created_at: "2026-08-18T10:00:00.000Z",
        },
      ],
      relatedOutRows: [
        {
          id: "global-suv",
          title: "Honda CR-V",
          meta: { car_body_type: "suv" },
          trade_lgu_id: DAVAO,
          created_at: "2026-08-18T12:00:00.000Z",
        },
      ],
      hints,
      browseLguCanonicalId: PASIG,
      cursor: emptySearchExpansionCursor(),
    });
    expect(assembled.posts.map((row) => row.id)).toEqual([
      "exact",
      "token",
      "local-suv",
      "global-suv",
    ]);
  });

  it("forces within -> outside inside the same relevance tier (T1/T2/T3->T4)", () => {
    const hints = resolveSearchExpansionHints("Toyota Fortuner")!;
    const assembled = assembleSearchExpansionRound({
      exactRows: [
        {
          id: "t1-within",
          title: "Toyota Fortuner",
          meta: { car_body_type: "suv" },
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T10:00:00.000Z",
        },
      ],
      relatedInRows: [
        {
          id: "t2-within",
          title: "Fortuner 2022 Diesel",
          meta: { car_model: "Toyota Fortuner" },
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T09:00:00.000Z",
        },
        {
          id: "t3-within",
          title: "Montero Sport",
          meta: { car_body_type: "suv" },
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T08:00:00.000Z",
        },
      ],
      relatedOutRows: [
        {
          id: "t1-outside",
          title: "Toyota Fortuner",
          meta: { car_body_type: "suv" },
          trade_lgu_id: DAVAO,
          created_at: "2026-08-18T10:05:00.000Z",
        },
        {
          id: "t2-outside",
          title: "Fortuner 2022 Diesel",
          meta: { car_model: "Toyota Fortuner" },
          trade_lgu_id: DAVAO,
          created_at: "2026-08-18T09:05:00.000Z",
        },
        {
          id: "t3-outside",
          title: "Montero Sport",
          meta: { car_body_type: "suv" },
          trade_lgu_id: DAVAO,
          created_at: "2026-08-18T07:00:00.000Z",
        },
      ],
      hints,
      browseLguCanonicalId: PASIG,
      cursor: emptySearchExpansionCursor(),
    });

    const ids = assembled.posts.map((row) => row.id);
    expect(ids).toEqual(["t1-within", "t1-outside", "t2-within", "t2-outside", "t3-within", "t3-outside"]);

    // additional: outside T1 must remain before within T2 (normal tier ordering)
    expect(ids.indexOf("t1-outside")).toBeLessThan(ids.indexOf("t2-within"));
  });

  it("keeps ordering contract across continuation (page1/page2 concat style)", () => {
    const hints = resolveSearchExpansionHints("Toyota Fortuner")!;
    const page1 = assembleSearchExpansionRound({
      exactRows: [
        {
          id: "t1-within",
          title: "Toyota Fortuner",
          meta: { car_body_type: "suv" },
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T10:00:00.000Z",
        },
      ],
      relatedInRows: [
        {
          id: "t2-within",
          title: "Fortuner 2022 Diesel",
          meta: { car_model: "Toyota Fortuner" },
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T09:00:00.000Z",
        },
      ],
      relatedOutRows: [
        {
          id: "t1-outside",
          title: "Toyota Fortuner",
          meta: { car_body_type: "suv" },
          trade_lgu_id: DAVAO,
          created_at: "2026-08-18T10:05:00.000Z",
        },
      ],
      hints,
      browseLguCanonicalId: PASIG,
      cursor: emptySearchExpansionCursor(),
    });

    const page2 = assembleSearchExpansionRound({
      exactRows: [],
      relatedInRows: [
        {
          id: "t3-within",
          title: "Montero Sport",
          meta: { car_body_type: "suv" },
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T08:00:00.000Z",
        },
      ],
      relatedOutRows: [
        {
          id: "t2-outside",
          title: "Fortuner 2022 Diesel",
          meta: { car_model: "Toyota Fortuner" },
          trade_lgu_id: DAVAO,
          created_at: "2026-08-18T09:05:00.000Z",
        },
        {
          id: "t3-outside",
          title: "Montero Sport",
          meta: { car_body_type: "suv" },
          trade_lgu_id: DAVAO,
          created_at: "2026-08-18T07:00:00.000Z",
        },
      ],
      hints,
      browseLguCanonicalId: PASIG,
      cursor: page1.cursor,
    });

    const ids = [...page1.posts, ...page2.posts].map((row) => row.id);
    expect(ids).toEqual(["t1-within", "t1-outside", "t2-within", "t2-outside", "t3-within", "t3-outside"]);
  });

  it("keeps related-in/out cursors when exact/T1 is exhausted", () => {
    const start = {
      ...emptySearchExpansionCursor(),
      exactOffset: 40,
      relatedInOffset: 50,
      relatedOutOffset: 30,
      exactExhausted: true,
    };
    const next = advanceSearchExpansionCursor(
      start,
      { exact: 0, relatedIn: 50, relatedOut: 30 },
      { exact: 40, relatedIn: 50, relatedOut: 30 },
      { exact: false, relatedIn: true, relatedOut: true }
    );
    expect(next.exactExhausted).toBe(true);
    expect(next.exactOffset).toBe(40);
    expect(next.relatedInExhausted).toBe(false);
    expect(next.relatedOutExhausted).toBe(false);
    expect(next.relatedInOffset).toBe(100);
    expect(next.relatedOutOffset).toBe(60);
    expect(searchExpansionSourcesExhausted(next)).toBe(false);
  });

  it("drops already-returned ids on the next window and still keeps new T2/T3 rows", () => {
    const hints = resolveSearchExpansionHints("Toyota Fortuner")!;
    const first = assembleSearchExpansionRound({
      exactRows: [
        {
          id: "exact",
          title: "Toyota Fortuner",
          meta: { car_body_type: "suv" },
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T10:00:00.000Z",
        },
      ],
      relatedInRows: [
        {
          id: "t2-a",
          title: "Fortuner 2022 Diesel",
          meta: { car_model: "Toyota Fortuner" },
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T09:00:00.000Z",
        },
      ],
      relatedOutRows: [],
      hints,
      browseLguCanonicalId: PASIG,
      cursor: emptySearchExpansionCursor(),
    });
    const second = assembleSearchExpansionRound({
      exactRows: [],
      relatedInRows: [
        {
          id: "exact",
          title: "Toyota Fortuner",
          meta: { car_body_type: "suv" },
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T10:00:00.000Z",
        },
        {
          id: "t2-b",
          title: "Fortuner 2019",
          meta: { car_model: "Toyota Fortuner" },
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T08:00:00.000Z",
        },
        {
          id: "t3-suv",
          title: "Montero Sport",
          meta: { car_body_type: "suv" },
          trade_lgu_id: PASIG,
          created_at: "2026-08-18T07:00:00.000Z",
        },
      ],
      relatedOutRows: [],
      hints,
      browseLguCanonicalId: PASIG,
      cursor: first.cursor,
    });
    expect(first.posts.map((row) => row.id)).toEqual(["exact", "t2-a"]);
    expect(second.posts.map((row) => row.id)).toEqual(["t2-b", "t3-suv"]);
    const all = [...first.posts, ...second.posts].map((row) => row.id);
    expect(new Set(all).size).toBe(all.length);
  });
});

function rankedWindowKeyFromSearch(input: {
  q: string;
  locSegment: string;
  marketSegment: string;
  priceMin?: number;
  priceMax?: number;
  composition?: Record<string, string>;
  mixedDiscoverySellIntent?: boolean;
  tradeState?: string;
  sort?: string;
}): string {
  const sort = input.sort ?? "latest";
  const querySegmentBase = marketplaceQueryCacheSegment({
    q: input.q,
    priceMin: input.priceMin,
    priceMax: input.priceMax,
    sort,
  });
  const cfSegment =
    input.composition && Object.keys(input.composition).length > 0
      ? `:${compositionFilterCacheSegment(input.composition)}`
      : "";
  const querySegment = `${querySegmentBase}${cfSegment}${
    input.mixedDiscoverySellIntent ? ":si:mix" : ""
  }`;
  return buildSearchRankedWindowCacheKey({
    sort,
    type: "all",
    marketSegment: input.marketSegment,
    tradeState: input.tradeState ?? "latest",
    locSegment: input.locSegment,
    querySegment,
  });
}

describe("CUT C ranked window cache", () => {
  it("includes q/location/category/price/composition/sell-intent/status/sort and omits page", () => {
    const key = rankedWindowKeyFromSearch({
      q: "Toyota Fortuner",
      locSegment: "loc:lgu:1381200000:r:64",
      marketSegment: "used-car-root",
      priceMin: 100000,
      priceMax: 900000,
      composition: { body_type: "suv" },
      mixedDiscoverySellIntent: true,
      tradeState: "active",
      sort: "latest",
    });
    expect(key).toContain("q:Toyota Fortuner");
    expect(key).toContain("loc:lgu:1381200000:r:64");
    expect(key).toContain("m:used-car-root");
    expect(key).toContain("pmin:100000");
    expect(key).toContain("pmax:900000");
    expect(key).toContain("body_type=suv");
    expect(key).toContain("si:mix");
    expect(key).toContain("ts:active");
    expect(key).toContain("latest");
    expect(key.includes("page")).toBe(false);
    expect(key).not.toMatch(/(^|:)page=/);
  });

  it("uses a new window when location, category, price, or composition changes", () => {
    const base = {
      q: "Toyota Fortuner",
      locSegment: "loc:lgu:1381200000:r:64",
      marketSegment: "used-car-root",
      priceMin: 100000,
      composition: { body_type: "suv" },
      mixedDiscoverySellIntent: true,
    };
    const a = rankedWindowKeyFromSearch(base);
    expect(a).not.toBe(
      rankedWindowKeyFromSearch({ ...base, locSegment: "loc:lgu:1130700000:r:64" })
    );
    expect(a).not.toBe(rankedWindowKeyFromSearch({ ...base, marketSegment: "jobs-root" }));
    expect(a).not.toBe(rankedWindowKeyFromSearch({ ...base, priceMin: 200000 }));
    expect(a).not.toBe(
      rankedWindowKeyFromSearch({ ...base, composition: { body_type: "sedan" } })
    );
  });

  it("lets page2 slice the same window with DB 0 extra loads", async () => {
    resetSearchRankedWindowCacheForTests();
    const rows = Array.from({ length: 120 }, (_, i) => ({ id: `p${i}` }));
    let loads = 0;
    const loadNext = async () => {
      loads += 1;
      return {
        posts: rows,
        queryCount: 3,
        cursor: {
          ...emptySearchExpansionCursor(),
          exactOffset: 40,
          relatedInOffset: 50,
          relatedOutOffset: 30,
          exactExhausted: false,
          relatedInExhausted: false,
          relatedOutExhausted: false,
          seenIds: rows.map((row) => row.id),
        },
      };
    };
    const key = "exp:test:page-share";
    const page1 = await takeSearchRankedWindowPage({
      key,
      page: 1,
      pageSize: 50,
      loadNext,
    });
    const page2 = await takeSearchRankedWindowPage({
      key,
      page: 2,
      pageSize: 50,
      loadNext,
    });
    expect(loads).toBe(1);
    expect(page1?.queryCount).toBe(3);
    expect(page2?.queryCount).toBe(3);
    expect(page1?.posts.map((row) => row.id)).toEqual(rows.slice(0, 50).map((row) => row.id));
    expect(page2?.posts.map((row) => row.id)).toEqual(rows.slice(50, 100).map((row) => row.id));
    expect(page1?.hasMore).toBe(true);
    expect(page2?.hasMore).toBe(true);
  });

  it("does not treat a short window as search exhaustion when sources remain", async () => {
    resetSearchRankedWindowCacheForTests();
    let loads = 0;
    const loadNext = async () => {
      loads += 1;
      const start = (loads - 1) * 20;
      return {
        posts: Array.from({ length: 20 }, (_, i) => ({ id: `w${start + i}` })),
        queryCount: 3,
        cursor: {
          ...emptySearchExpansionCursor(),
          exactOffset: loads * 40,
          relatedInOffset: loads * 50,
          relatedOutOffset: loads * 30,
          exactExhausted: false,
          relatedInExhausted: false,
          relatedOutExhausted: false,
          seenIds: [],
        },
      };
    };
    const page1 = await takeSearchRankedWindowPage({
      key: "exp:test:continue",
      page: 1,
      pageSize: 50,
      loadNext,
    });
    expect(page1?.posts).toHaveLength(50);
    expect(page1?.hasMore).toBe(true);
    expect(loads).toBe(3);
    const page2 = await takeSearchRankedWindowPage({
      key: "exp:test:continue",
      page: 2,
      pageSize: 50,
      loadNext,
    });
    expect(loads).toBe(5);
    expect(page2?.posts).toHaveLength(50);
    expect(page2?.posts[0]?.id).toBe("w50");
    expect(page2?.hasMore).toBe(true);
  });

  it("does not end search when a round returns 0 new rows but sources remain", async () => {
    resetSearchRankedWindowCacheForTests();
    let loads = 0;
    const loadNext = async () => {
      loads += 1;
      if (loads === 1) {
        return {
          posts: Array.from({ length: 50 }, (_, i) => ({ id: `keep-${i}` })),
          queryCount: 3,
          cursor: {
            ...emptySearchExpansionCursor(),
            exactOffset: 40,
            relatedInOffset: 50,
            relatedOutOffset: 30,
            exactExhausted: true,
            relatedInExhausted: false,
            relatedOutExhausted: false,
            seenIds: Array.from({ length: 50 }, (_, i) => `keep-${i}`),
          },
        };
      }
      return {
        posts: [],
        queryCount: 2,
        cursor: {
          ...emptySearchExpansionCursor(),
          exactOffset: 40,
          relatedInOffset: 100,
          relatedOutOffset: 60,
          exactExhausted: true,
          relatedInExhausted: false,
          relatedOutExhausted: false,
          seenIds: Array.from({ length: 50 }, (_, i) => `keep-${i}`),
        },
      };
    };
    const page1 = await takeSearchRankedWindowPage({
      key: "exp:test:empty-round",
      page: 1,
      pageSize: 50,
      loadNext,
    });
    expect(page1?.hasMore).toBe(true);
    const page2 = await takeSearchRankedWindowPage({
      key: "exp:test:empty-round",
      page: 2,
      pageSize: 50,
      loadNext,
    });
    expect(page2?.hasMore).toBe(true);
    expect(loads).toBeGreaterThan(1);
  });

  it("sets hasMore false only when every source is exhausted", async () => {
    resetSearchRankedWindowCacheForTests();
    const page1 = await takeSearchRankedWindowPage({
      key: "exp:test:all-exhausted",
      page: 1,
      pageSize: 50,
      loadNext: async () => ({
        posts: [{ id: "only" }],
        queryCount: 1,
        cursor: {
          ...emptySearchExpansionCursor(),
          exactExhausted: true,
          relatedInExhausted: true,
          relatedOutExhausted: true,
          tailExhausted: true,
          seenIds: ["only"],
        },
      }),
    });
    expect(page1?.posts).toEqual([{ id: "only" }]);
    expect(page1?.hasMore).toBe(false);
  });
});
