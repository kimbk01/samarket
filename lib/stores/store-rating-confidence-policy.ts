/**
 * Rating confidence policy — C maintenance delta + Bayesian weighted score helpers.
 * prior_weight (m) is owned by DB singleton `store_rating_confidence_policy` — never hardcode in comparator.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type StoreRatingConfidenceState = {
  ratingSum: number;
  ratingCount: number;
  globalMeanRating: number | null;
  priorWeight: number | null;
};

export type StoreReviewConfidenceFields = {
  rating: number | null;
  status: string | null;
  visibleToPublic: boolean | null;
};

/** Usable policy for sort=rating Bayesian path (O(1) singleton). */
export type StoreRatingConfidencePolicyAuthority = {
  globalMeanRating: number;
  priorWeight: number;
};

export type StoreRatingConfidenceLoadStatus = "active" | "fallback_raw" | "error";

export type StoreRatingConfidenceLoadResult = {
  status: StoreRatingConfidenceLoadStatus;
  policy: StoreRatingConfidencePolicyAuthority | null;
};

export function isPublicRatingContribution(row: StoreReviewConfidenceFields): boolean {
  const rating = row.rating;
  return (
    row.status === "visible" &&
    row.visibleToPublic === true &&
    rating != null &&
    Number.isFinite(rating) &&
    rating >= 1 &&
    rating <= 5
  );
}

export function meanFromSumCount(ratingSum: number, ratingCount: number): number | null {
  if (ratingCount < 0) throw new Error("rating_count cannot be negative");
  if (ratingCount === 0) return null;
  return ratingSum / ratingCount;
}

export function applyConfidenceDelta(
  state: StoreRatingConfidenceState,
  deltaSum: number,
  deltaCount: number
): StoreRatingConfidenceState {
  if (deltaSum === 0 && deltaCount === 0) return state;
  let ratingSum = state.ratingSum + deltaSum;
  const ratingCount = state.ratingCount + deltaCount;
  if (ratingCount < 0) throw new Error("rating_count would be negative");
  if (ratingCount === 0) ratingSum = 0;
  return {
    ratingSum,
    ratingCount,
    globalMeanRating: meanFromSumCount(ratingSum, ratingCount),
    priorWeight: state.priorWeight,
  };
}

/** OLD/NEW contribution replace — mirrors DB trigger delta. */
export function applyReviewMutationToConfidence(
  state: StoreRatingConfidenceState,
  op: "insert" | "delete" | "update",
  oldRow: StoreReviewConfidenceFields | null,
  newRow: StoreReviewConfidenceFields | null
): StoreRatingConfidenceState {
  let deltaSum = 0;
  let deltaCount = 0;

  if (op === "insert") {
    if (newRow && isPublicRatingContribution(newRow)) {
      deltaSum = Number(newRow.rating);
      deltaCount = 1;
    }
    return applyConfidenceDelta(state, deltaSum, deltaCount);
  }

  if (op === "delete") {
    if (oldRow && isPublicRatingContribution(oldRow)) {
      deltaSum = -Number(oldRow.rating);
      deltaCount = -1;
    }
    return applyConfidenceDelta(state, deltaSum, deltaCount);
  }

  if (oldRow && isPublicRatingContribution(oldRow)) {
    deltaSum -= Number(oldRow.rating);
    deltaCount -= 1;
  }
  if (newRow && isPublicRatingContribution(newRow)) {
    deltaSum += Number(newRow.rating);
    deltaCount += 1;
  }
  return applyConfidenceDelta(state, deltaSum, deltaCount);
}

export function emptyConfidenceState(): StoreRatingConfidenceState {
  return {
    ratingSum: 0,
    ratingCount: 0,
    globalMeanRating: null,
    priorWeight: null,
  };
}

export function initConfidenceFromPublicReviews(
  rows: StoreReviewConfidenceFields[],
  priorWeight: number | null = null
): StoreRatingConfidenceState {
  let ratingSum = 0;
  let ratingCount = 0;
  for (const row of rows) {
    if (!isPublicRatingContribution(row)) continue;
    ratingSum += Number(row.rating);
    ratingCount += 1;
  }
  return {
    ratingSum,
    ratingCount,
    globalMeanRating: meanFromSumCount(ratingSum, ratingCount),
    priorWeight,
  };
}

/**
 * Bayesian weighted rating.
 * weighted = (v/(v+m))*R + (m/(v+m))*C
 * R null → null (unrated stays after rated).
 */
export function computeBayesianWeightedRating(
  ratingAvg: number | null,
  reviewCount: number | null | undefined,
  policy: StoreRatingConfidencePolicyAuthority
): number | null {
  if (ratingAvg == null || !Number.isFinite(ratingAvg)) return null;
  const v = Number.isFinite(Number(reviewCount))
    ? Math.max(0, Math.floor(Number(reviewCount) || 0))
    : 0;
  const m = policy.priorWeight;
  const C = policy.globalMeanRating;
  if (!(m > 0) || !Number.isFinite(m) || !Number.isFinite(C)) return null;
  return (v / (v + m)) * ratingAvg + (m / (v + m)) * C;
}

export function isUsableRatingConfidencePolicy(
  raw: {
    global_mean_rating?: unknown;
    prior_weight?: unknown;
  } | null
): StoreRatingConfidencePolicyAuthority | null {
  if (!raw) return null;
  if (raw.global_mean_rating == null || raw.prior_weight == null) return null;
  const C = Number(raw.global_mean_rating);
  const m = Number(raw.prior_weight);
  if (!Number.isFinite(C) || !Number.isFinite(m) || m <= 0) return null;
  return { globalMeanRating: C, priorWeight: m };
}

/**
 * O(1) singleton read. No request-path global AVG.
 * FAILURE: missing/invalid C|m → fallback_raw; load error → error.
 * Comparator then uses raw rating_avg (explicit degrade, not silent alternate formula).
 */
export async function loadStoreRatingConfidencePolicy(
  sb: SupabaseClient
): Promise<StoreRatingConfidenceLoadResult> {
  try {
    const { data, error } = await sb
      .from("store_rating_confidence_policy")
      .select("global_mean_rating, prior_weight")
      .eq("id", 1)
      .maybeSingle();
    if (error) return { status: "error", policy: null };
    const policy = isUsableRatingConfidencePolicy(
      (data as { global_mean_rating?: unknown; prior_weight?: unknown } | null) ?? null
    );
    if (!policy) return { status: "fallback_raw", policy: null };
    return { status: "active", policy };
  } catch {
    return { status: "error", policy: null };
  }
}
