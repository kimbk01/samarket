/**
 * Rating confidence C — delta model (mirrors DB trigger authority).
 * Sort comparator / prior_weight numeric value: OUT of this cut.
 */

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
  if (ratingCount < 0) {
    throw new Error("rating_count cannot be negative");
  }
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
  if (ratingCount < 0) {
    throw new Error("rating_count would be negative");
  }
  if (ratingCount === 0) {
    ratingSum = 0;
  }
  return {
    ratingSum,
    ratingCount,
    globalMeanRating: meanFromSumCount(ratingSum, ratingCount),
    priorWeight: state.priorWeight,
  };
}

/** OLD/NEW contribution replace — same as trg_store_reviews_rating_confidence_policy. */
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

/** One-time init from public rows (apply-time scan model; not request path). */
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
