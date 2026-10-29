/** v4 PERF-11 — `store_reviews.rating` (smallint, CHECK 1..5) 별점 버킷 */
export const REVIEW_RATING_BUCKETS = [1, 2, 3, 4, 5] as const;

/**
 * 별점 1~5 COUNT(DB 측 집계 결과, 인덱스 0 = 1점)로 분포·총수·평균(소수 1자리)을 만든다.
 * 기존 전체 행 JS 집계와 같은 산식: avg = round(Σ rating / count, 1).
 */
export function summarizeReviewRatingCounts(counts: readonly number[]): {
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  totalCount: number;
  avgRating: number | null;
} {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalCount = 0;
  let sum = 0;
  REVIEW_RATING_BUCKETS.forEach((rating, i) => {
    const raw = Number(counts[i] ?? 0);
    const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
    distribution[rating] = n;
    totalCount += n;
    sum += rating * n;
  });
  const avgRating = totalCount > 0 ? Math.round((sum / totalCount) * 10) / 10 : null;
  return { distribution, totalCount, avgRating };
}
