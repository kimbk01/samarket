import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyReviewMutationToConfidence,
  computeBayesianWeightedRating,
  emptyConfidenceState,
  initConfidenceFromPublicReviews,
  isPublicRatingContribution,
  isUsableRatingConfidencePolicy,
  type StoreReviewConfidenceFields,
} from "@/lib/stores/store-rating-confidence-policy";
import {
  resolveStoreBrowseSortedByMeta,
  sortStoreDiscoveryBrowseRows,
  type StoreDiscoverySortContext,
} from "@/lib/stores/store-discovery-browse-sort";
import {
  applyNewAuthorityRatingConfidenceToBrowseFilter,
  type BrowseFilteredStoreRowsResult,
  type StoreBrowseRow,
} from "@/lib/stores/stores-browse-build";

const MIGRATION_C = join(
  process.cwd(),
  "supabase/migrations/20260823200000_store_rating_confidence_policy.sql"
);
const MIGRATION_M10 = join(
  process.cwd(),
  "supabase/migrations/20260823210000_store_rating_confidence_prior_weight_m10.sql"
);
const STORE_AGG = join(
  process.cwd(),
  "supabase/migrations/20260823120000_store_rating_aggregate_sync.sql"
);
const BROWSE_SORT = join(process.cwd(), "lib/stores/store-discovery-browse-sort.ts");
const PRIMARY_VIEW = join(process.cwd(), "components/stores/browse/StoresBrowsePrimaryView.tsx");

function review(
  partial: Partial<StoreReviewConfidenceFields> & { rating?: number | null }
): StoreReviewConfidenceFields {
  return {
    rating: Object.prototype.hasOwnProperty.call(partial, "rating") ? (partial.rating ?? null) : 5,
    status: partial.status ?? "visible",
    visibleToPublic: partial.visibleToPublic ?? true,
  };
}

describe("store rating confidence — C authority", () => {
  const sql = readFileSync(MIGRATION_C, "utf8");
  const aggSql = readFileSync(STORE_AGG, "utf8");

  it("T1 initial sum/count/mean from public population only", () => {
    const init = initConfidenceFromPublicReviews([
      review({ rating: 5 }),
      review({ rating: 4 }),
      review({ rating: 5, status: "hidden" }),
      review({ rating: 3, visibleToPublic: false }),
      review({ rating: null }),
      review({ rating: 0 }),
      review({ rating: 6 }),
    ]);
    expect(init.ratingCount).toBe(2);
    expect(init.ratingSum).toBe(9);
    expect(init.globalMeanRating).toBe(4.5);
    expect(init.priorWeight).toBeNull();
  });

  it("T2–T6 insert/delete/visibility/rating deltas", () => {
    let s = emptyConfidenceState();
    s = applyReviewMutationToConfidence(s, "insert", null, review({ rating: 5 }));
    s = applyReviewMutationToConfidence(s, "insert", null, review({ rating: 3 }));
    expect(s).toMatchObject({ ratingSum: 8, ratingCount: 2, globalMeanRating: 4 });

    s = applyReviewMutationToConfidence(s, "delete", review({ rating: 5 }), null);
    expect(s).toMatchObject({ ratingSum: 3, ratingCount: 1, globalMeanRating: 3 });

    s = applyReviewMutationToConfidence(
      s,
      "update",
      review({ rating: 3, status: "visible" }),
      review({ rating: 3, status: "hidden" })
    );
    expect(s.globalMeanRating).toBeNull();

    s = applyReviewMutationToConfidence(
      s,
      "update",
      review({ rating: 4, status: "hidden" }),
      review({ rating: 4, status: "visible" })
    );
    expect(s).toMatchObject({ ratingSum: 4, ratingCount: 1, globalMeanRating: 4 });

    s = applyReviewMutationToConfidence(s, "update", review({ rating: 4 }), review({ rating: 2 }));
    expect(s).toMatchObject({ ratingSum: 2, ratingCount: 1, globalMeanRating: 2 });
  });

  it("T7 invalid excluded; T8 count0 → mean null", () => {
    expect(isPublicRatingContribution(review({ rating: null }))).toBe(false);
    expect(isPublicRatingContribution(review({ rating: 0 }))).toBe(false);
    let s = initConfidenceFromPublicReviews([review({ rating: 5 })]);
    s = applyReviewMutationToConfidence(s, "delete", review({ rating: 5 }), null);
    expect(s).toEqual(emptyConfidenceState());
  });

  it("T9 no full-scan-on-write; T10 store aggregate preserved", () => {
    expect(sql).toContain("store_rating_confidence_apply_delta");
    const applyFn = sql.slice(
      sql.indexOf("store_rating_confidence_apply_delta"),
      sql.indexOf("trg_store_reviews_rating_confidence_policy")
    );
    expect(applyFn).not.toMatch(/AVG\s*\(/i);
    expect(applyFn).not.toMatch(/FROM\s+public\.store_reviews/i);
    expect(aggSql).toContain("refresh_store_public_rating_aggregate");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.refresh_store_public_rating_aggregate");
  });
});

describe("store rating confidence — Bayesian sort=rating", () => {
  const m10 = readFileSync(MIGRATION_M10, "utf8");
  const sortSrc = readFileSync(BROWSE_SORT, "utf8");
  const policy = { globalMeanRating: 4.3, priorWeight: 10 };

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
      sort: "rating",
      eligibilityRankById: new Map(),
      distanceKmById: null,
      outOfRangeById: null,
      hasGeo: false,
      ratingConfidencePolicy: policy,
      ...overrides,
    };
  }

  it("m=10 locked in policy migration; comparator does not hardcode 10", () => {
    expect(m10).toMatch(/prior_weight\s*=\s*10/);
    expect(sortSrc).toContain("ratingConfidencePolicy");
    expect(sortSrc).toContain("computeBayesianWeightedRating");
    expect(sortSrc).not.toMatch(/priorWeight\s*[:=]\s*10/);
    expect(sortSrc).not.toMatch(/prior_weight\s*[:=]\s*10/);
  });

  it("v=10 → R/C 50:50; higher v increases R influence", () => {
    expect(computeBayesianWeightedRating(5, 10, policy)).toBeCloseTo(4.65, 8);
    const w1 = computeBayesianWeightedRating(5, 1, policy)!;
    const w10 = computeBayesianWeightedRating(5, 10, policy)!;
    const w50 = computeBayesianWeightedRating(5, 50, policy)!;
    expect(w1).toBeLessThan(w10);
    expect(w10).toBeLessThan(w50);
  });

  it("1@5.0 ranks below high-sample 4.x after confidence", () => {
    const one = row({ id: "one", rating_avg: 5, review_count: 1 });
    const many = row({ id: "many", rating_avg: 4.4, review_count: 65 });
    expect(
      sortStoreDiscoveryBrowseRows([one, many], ctx({ ratingConfidencePolicy: null })).map((r) => r.id)
    ).toEqual(["one", "many"]);
    expect(sortStoreDiscoveryBrowseRows([one, many], ctx()).map((r) => r.id)).toEqual(["many", "one"]);
  });

  it("null R / unusable policy safe; unrated after rated", () => {
    expect(computeBayesianWeightedRating(null, 0, policy)).toBeNull();
    expect(isUsableRatingConfidencePolicy({ global_mean_rating: null, prior_weight: 10 })).toBeNull();
    const rated = row({ id: "r", rating_avg: 4, review_count: 10 });
    const none = row({ id: "n", rating_avg: null, review_count: 0 });
    expect(sortStoreDiscoveryBrowseRows([none, rated], ctx()).map((r) => r.id)).toEqual(["r", "n"]);
  });

  it("same weighted → review_count then stable slug; eligibility first", () => {
    const a = row({ id: "b", slug: "b", rating_avg: 4.5, review_count: 10 });
    const b = row({ id: "a", slug: "a", rating_avg: 4.5, review_count: 10 });
    expect(sortStoreDiscoveryBrowseRows([a, b], ctx()).map((r) => r.id)).toEqual(["a", "b"]);

    const more = row({ id: "c", rating_avg: 4.5, review_count: 20 });
    const fewer = row({ id: "d", rating_avg: 4.5, review_count: 5 });
    expect(sortStoreDiscoveryBrowseRows([fewer, more], ctx()).map((r) => r.id)).toEqual(["c", "d"]);

    const lowElig = row({ id: "low", rating_avg: 5, review_count: 100 });
    const highElig = row({ id: "high", rating_avg: 3, review_count: 1 });
    expect(
      sortStoreDiscoveryBrowseRows(
        [lowElig, highElig],
        ctx({
          eligibilityRankById: new Map([
            ["high", 0],
            ["low", 2],
          ]),
        })
      ).map((r) => r.id)
    ).toEqual(["high", "low"]);
  });

  it("other sorts / meta unchanged; client keeps server order", () => {
    expect(resolveStoreBrowseSortedByMeta("rating", false, true)).toBe("eligibility_rating_confidence");
    expect(resolveStoreBrowseSortedByMeta("rating", false, false)).toBe("eligibility_rating");
    expect(resolveStoreBrowseSortedByMeta("popular", false, true)).toBe("eligibility_popular");
    expect(resolveStoreBrowseSortedByMeta("fast", false, true)).toBe("eligibility_prep");
    expect(resolveStoreBrowseSortedByMeta("reviews", false, true)).toBe("eligibility_reviews");
    expect(resolveStoreBrowseSortedByMeta("distance", true, true)).toBe("eligibility_distance");
    expect(resolveStoreBrowseSortedByMeta("default", true, true)).toBe(
      "eligibility_district_distance_orders_rating"
    );

    const view = readFileSync(PRIMARY_VIEW, "utf8");
    expect(view).toContain("const sortedRemoteRows = remoteRows");
  });
});

describe("store rating confidence — NEW authority wiring", () => {
  const SNAPSHOT = join(process.cwd(), "lib/stores/stores-browse-snapshot.ts");
  const BUILD = join(process.cwd(), "lib/stores/stores-browse-build.ts");
  const C = 4.25;
  const m = 10;
  const policy = { globalMeanRating: C, priorWeight: m };

  function browseRow(
    partial: Partial<StoreBrowseRow> & {
      id: string;
      rating_avg: number | null;
      review_count: number | null;
    }
  ): StoreBrowseRow {
    return {
      store_name: partial.store_name ?? partial.id,
      slug: partial.slug ?? partial.id,
      description: null,
      region: null,
      city: null,
      district: null,
      profile_image_url: null,
      is_open: true,
      point_commerce_blocked: false,
      delivery_available: true,
      pickup_available: true,
      visit_available: true,
      reservation_available: false,
      is_featured: false,
      lat: null,
      lng: null,
      business_hours_json: null,
      business_type: null,
      store_topics: null,
      ...partial,
    };
  }

  function filterOf(rows: StoreBrowseRow[]): BrowseFilteredStoreRowsResult {
    return {
      rows,
      distById: null,
      statusById: new Map(),
      distanceSortMs: 0,
      outOfRangeById: new Map(),
    };
  }

  function newCtx(sort: "default" | "distance" | "rating" | "reviews" | "popular" | "fast" = "rating") {
    return {
      district: null as string | null,
      sort,
      deliveryDistancePolicy: { enabled: false },
      origin: { lat: null as number | null, lng: null as number | null },
    } as Parameters<typeof applyNewAuthorityRatingConfidenceToBrowseFilter>[0];
  }

  it("T1 NEW snapshot wires policy load + confidence apply on sort=rating", () => {
    const snap = readFileSync(SNAPSHOT, "utf8");
    const build = readFileSync(BUILD, "utf8");
    expect(snap).toContain("isStoreDiscoveryRankingAuthorityNew");
    expect(snap).toContain("loadBrowseDiscoveryRankedForLive");
    expect(snap).toContain("applyNewAuthorityRatingConfidenceToBrowseFilter");
    expect(snap).toContain('if (ctx.sort === "rating")');
    expect(build).toContain("export function applyNewAuthorityRatingConfidenceToBrowseFilter");
    expect(snap).toContain("resolveBrowseFilteredSortedStoreRows");
  });

  it("T2–T3 active policy: 65@4.4 > 31@4.4 > 1@5.0", () => {
    const one = browseRow({ id: "one", rating_avg: 5, review_count: 1 });
    const high65 = browseRow({ id: "h65", rating_avg: 4.4, review_count: 65 });
    const high31 = browseRow({ id: "h31", rating_avg: 4.4, review_count: 31 });
    const w1 = computeBayesianWeightedRating(5, 1, policy)!;
    const w65 = computeBayesianWeightedRating(4.4, 65, policy)!;
    const w31 = computeBayesianWeightedRating(4.4, 31, policy)!;
    expect(w65).toBeGreaterThan(w31);
    expect(w31).toBeGreaterThan(w1);

    const sorted = applyNewAuthorityRatingConfidenceToBrowseFilter(
      newCtx("rating"),
      filterOf([one, high31, high65]),
      policy,
      "active"
    );
    expect(sorted.rows.map((r) => r.id)).toEqual(["h65", "h31", "one"]);
    expect(sorted.ratingConfidenceStatus).toBe("active");
  });

  it("T4–T5 fallback_raw / error keep raw rating order + status", () => {
    const one = browseRow({ id: "one", rating_avg: 5, review_count: 1 });
    const many = browseRow({ id: "many", rating_avg: 4.4, review_count: 65 });
    const rawFallback = applyNewAuthorityRatingConfidenceToBrowseFilter(
      newCtx("rating"),
      filterOf([many, one]),
      null,
      "fallback_raw"
    );
    expect(rawFallback.rows.map((r) => r.id)).toEqual(["one", "many"]);
    expect(rawFallback.ratingConfidenceStatus).toBe("fallback_raw");

    const rawError = applyNewAuthorityRatingConfidenceToBrowseFilter(
      newCtx("rating"),
      filterOf([many, one]),
      null,
      "error"
    );
    expect(rawError.rows.map((r) => r.id)).toEqual(["one", "many"]);
    expect(rawError.ratingConfidenceStatus).toBe("error");
  });

  it("T6–T10 other sorts untouched by NEW confidence helper", () => {
    const one = browseRow({ id: "one", rating_avg: 5, review_count: 1 });
    const many = browseRow({ id: "many", rating_avg: 4.4, review_count: 65 });
    for (const sort of ["default", "popular", "reviews", "distance", "fast"] as const) {
      const out = applyNewAuthorityRatingConfidenceToBrowseFilter(
        newCtx(sort),
        filterOf([one, many]),
        policy,
        "active"
      );
      expect(out.rows.map((r) => r.id)).toEqual(["one", "many"]);
      expect(out.ratingConfidenceStatus).toBeUndefined();
    }
  });

  it("T11–T12 OLD path + client re-sort contracts preserved", () => {
    const snap = readFileSync(SNAPSHOT, "utf8");
    const view = readFileSync(PRIMARY_VIEW, "utf8");
    expect(snap).toContain("resolveBrowseFilteredSortedStoreRows");
    expect(snap).toContain("ratingConfidencePolicy");
    expect(view).toContain("const sortedRemoteRows = remoteRows");
  });
});
