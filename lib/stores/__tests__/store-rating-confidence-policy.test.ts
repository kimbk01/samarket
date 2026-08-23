import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyReviewMutationToConfidence,
  emptyConfidenceState,
  initConfidenceFromPublicReviews,
  isPublicRatingContribution,
  type StoreReviewConfidenceFields,
} from "@/lib/stores/store-rating-confidence-policy";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260823200000_store_rating_confidence_policy.sql"
);

const STORE_AGG_MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260823120000_store_rating_aggregate_sync.sql"
);

function row(
  partial: Partial<StoreReviewConfidenceFields> & { rating?: number | null }
): StoreReviewConfidenceFields {
  return {
    rating: Object.prototype.hasOwnProperty.call(partial, "rating") ? (partial.rating ?? null) : 5,
    status: partial.status ?? "visible",
    visibleToPublic: partial.visibleToPublic ?? true,
  };
}

describe("store rating confidence policy — C authority", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const storeAggSql = readFileSync(STORE_AGG_MIGRATION, "utf8");

  it("T1 initial sum/count/mean from public population only", () => {
    const init = initConfidenceFromPublicReviews([
      row({ rating: 5 }),
      row({ rating: 4 }),
      row({ rating: 5, status: "hidden" }),
      row({ rating: 3, visibleToPublic: false }),
      row({ rating: null as unknown as number, status: "visible" }),
      row({ rating: 0 }),
      row({ rating: 6 }),
    ]);
    expect(init.ratingCount).toBe(2);
    expect(init.ratingSum).toBe(9);
    expect(init.globalMeanRating).toBe(4.5);
    expect(init.priorWeight).toBeNull();
  });

  it("T2 public insert adds", () => {
    let s = emptyConfidenceState();
    s = applyReviewMutationToConfidence(s, "insert", null, row({ rating: 5 }));
    expect(s).toMatchObject({ ratingSum: 5, ratingCount: 1, globalMeanRating: 5 });
    s = applyReviewMutationToConfidence(s, "insert", null, row({ rating: 3 }));
    expect(s).toMatchObject({ ratingSum: 8, ratingCount: 2, globalMeanRating: 4 });
  });

  it("T3 public delete subtracts", () => {
    let s = initConfidenceFromPublicReviews([row({ rating: 5 }), row({ rating: 3 })]);
    s = applyReviewMutationToConfidence(s, "delete", row({ rating: 5 }), null);
    expect(s).toMatchObject({ ratingSum: 3, ratingCount: 1, globalMeanRating: 3 });
  });

  it("T4 hidden→visible adds", () => {
    let s = emptyConfidenceState();
    s = applyReviewMutationToConfidence(
      s,
      "update",
      row({ rating: 4, status: "hidden" }),
      row({ rating: 4, status: "visible" })
    );
    expect(s).toMatchObject({ ratingSum: 4, ratingCount: 1, globalMeanRating: 4 });
  });

  it("T5 visible→hidden subtracts", () => {
    let s = initConfidenceFromPublicReviews([row({ rating: 4 }), row({ rating: 2 })]);
    s = applyReviewMutationToConfidence(
      s,
      "update",
      row({ rating: 4, status: "visible" }),
      row({ rating: 4, status: "hidden" })
    );
    expect(s).toMatchObject({ ratingSum: 2, ratingCount: 1, globalMeanRating: 2 });
  });

  it("T6 rating update replaces contribution", () => {
    let s = initConfidenceFromPublicReviews([row({ rating: 5 })]);
    s = applyReviewMutationToConfidence(
      s,
      "update",
      row({ rating: 5 }),
      row({ rating: 3 })
    );
    expect(s).toMatchObject({ ratingSum: 3, ratingCount: 1, globalMeanRating: 3 });
  });

  it("T7 invalid/null excluded", () => {
    expect(isPublicRatingContribution(row({ rating: null }))).toBe(false);
    expect(isPublicRatingContribution(row({ rating: 0 }))).toBe(false);
    expect(isPublicRatingContribution(row({ rating: 6 }))).toBe(false);
    expect(isPublicRatingContribution(row({ status: "pending" }))).toBe(false);
    expect(isPublicRatingContribution(row({ visibleToPublic: false }))).toBe(false);

    let s = emptyConfidenceState();
    s = applyReviewMutationToConfidence(s, "insert", null, row({ rating: null }));
    s = applyReviewMutationToConfidence(s, "insert", null, row({ rating: 0 }));
    s = applyReviewMutationToConfidence(s, "insert", null, row({ rating: 6 }));
    expect(s).toEqual(emptyConfidenceState());
  });

  it("T8 count 0 → mean NULL", () => {
    let s = initConfidenceFromPublicReviews([row({ rating: 5 })]);
    s = applyReviewMutationToConfidence(s, "delete", row({ rating: 5 }), null);
    expect(s.ratingCount).toBe(0);
    expect(s.ratingSum).toBe(0);
    expect(s.globalMeanRating).toBeNull();
  });

  it("T9 migration has no full-scan-on-write AVG; init scan is one-time only", () => {
    expect(sql).toContain("store_rating_confidence_policy");
    expect(sql).toContain("store_rating_confidence_apply_delta");
    expect(sql).toContain("trg_store_reviews_rating_confidence_policy");
    expect(sql).toContain("rating_sum");
    expect(sql).toContain("rating_count");
    expect(sql).toContain("global_mean_rating");
    expect(sql).toContain("prior_weight");
    expect(sql).toMatch(/prior_weight numeric NULL/);
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");

    // Trigger body must not re-AVG the whole store_reviews table.
    const triggerFn = sql.slice(sql.indexOf("trg_store_reviews_rating_confidence_policy"));
    const applyFn = sql.slice(
      sql.indexOf("store_rating_confidence_apply_delta"),
      sql.indexOf("trg_store_reviews_rating_confidence_policy")
    );
    expect(triggerFn).not.toMatch(/AVG\s*\(/i);
    expect(applyFn).not.toMatch(/FROM\s+public\.store_reviews/i);
    expect(applyFn).not.toMatch(/AVG\s*\(/i);

    // One-time init may SELECT FROM store_reviews once at end of migration.
    const initBlock = sql.slice(sql.lastIndexOf("INSERT INTO public.store_rating_confidence_policy"));
    expect(initBlock).toMatch(/FROM public\.store_reviews/);
    expect(initBlock).toContain("status = 'visible'");
    expect(initBlock).toContain("visible_to_public = true");
  });

  it("T10 existing store rating aggregate migration preserved (untouched contract)", () => {
    expect(storeAggSql).toContain("refresh_store_public_rating_aggregate");
    expect(storeAggSql).toContain("trg_store_reviews_refresh_rating_aggregate");
    expect(storeAggSql).toContain("rating_avg");
    expect(storeAggSql).toContain("review_count");
    // New migration must not rewrite/replace the store-local aggregate function.
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.refresh_store_public_rating_aggregate");
    expect(sql).not.toContain("trg_store_reviews_refresh_rating_aggregate");
    expect(sql).toContain("Separate from store-local rating aggregate trigger");
  });

  it("visible_to_public flip and store_id-style update keep global delta correct", () => {
    let s = initConfidenceFromPublicReviews([row({ rating: 5 })]);
    s = applyReviewMutationToConfidence(
      s,
      "update",
      row({ rating: 5, visibleToPublic: true }),
      row({ rating: 5, visibleToPublic: false })
    );
    expect(s.globalMeanRating).toBeNull();

    s = applyReviewMutationToConfidence(
      s,
      "update",
      row({ rating: 4, visibleToPublic: false }),
      row({ rating: 4, visibleToPublic: true })
    );
    expect(s).toMatchObject({ ratingSum: 4, ratingCount: 1, globalMeanRating: 4 });

    // store_id change with same public rating → net zero
    const before = s;
    s = applyReviewMutationToConfidence(s, "update", row({ rating: 4 }), row({ rating: 4 }));
    expect(s).toEqual(before);
  });
});
