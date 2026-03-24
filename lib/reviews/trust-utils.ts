/**
 * 10단계: 신뢰도 요약 계산 (mock, 동네 인증 확장 시 활용)
 */

import type { UserTrustSummary } from "@/lib/types/review";
import { getReviewsForTarget } from "./mock-reviews";

const BASE_MANNER = 50;

export function getTrustSummary(userId: string): UserTrustSummary {
  const reviews = getReviewsForTarget(userId);
  const count = reviews.length;
  if (count === 0) {
    return {
      userId,
      reviewCount: 0,
      averageRating: 0,
      mannerScore: BASE_MANNER,
      positiveCount: 0,
      negativeCount: 0,
      summaryTags: [],
    };
  }
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  const avg = sum / count;
  const positiveCount = reviews.filter((r) => r.rating >= 4).length;
  const negativeCount = reviews.filter((r) => r.rating <= 2).length;
  const tagCount: Record<string, number> = {};
  reviews.forEach((r) => {
    r.tags.forEach((t) => {
      tagCount[t] = (tagCount[t] ?? 0) + 1;
    });
  });
  const summaryTags = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);
  const mannerScore = Math.round((BASE_MANNER + (avg - 2.5) * 2) * 10) / 10;
  const clampedManner = Math.max(0, Math.min(99.9, mannerScore));

  return {
    userId,
    reviewCount: count,
    averageRating: Math.round(avg * 10) / 10,
    mannerScore: clampedManner,
    positiveCount,
    negativeCount,
    summaryTags,
  };
}
