/**
 * 16단계: 관리자 신뢰도 요약 (10단계 getTrustSummary 기반, 재계산 시 갱신)
 */

import type { AdminTrustSummary } from "@/lib/types/admin-review";
import type { ReviewStatus } from "@/lib/types/review";
import { getTrustSummary } from "@/lib/reviews/trust-utils";
import { getNickname } from "@/lib/admin-reports/mock-user-moderation";
import { MOCK_REVIEWS } from "@/lib/reviews/mock-reviews";

const CACHE: Record<string, { summary: AdminTrustSummary; updatedAt: string }> = {};

function buildTrustSummary(userId: string): AdminTrustSummary {
  const trust = getTrustSummary(userId);
  const hiddenCount = MOCK_REVIEWS.filter(
    (r) => r.targetUserId === userId && (r.reviewStatus ?? "visible") === "hidden"
  ).length;
  return {
    userId,
    nickname: getNickname(userId),
    reviewCount: trust.reviewCount,
    averageRating: trust.averageRating,
    mannerScore: trust.mannerScore,
    positiveCount: trust.positiveCount,
    negativeCount: trust.negativeCount,
    hiddenReviewCount: hiddenCount,
    updatedAt: new Date().toISOString(),
  };
}

export function getAdminTrustSummary(userId: string): AdminTrustSummary {
  const cached = CACHE[userId];
  if (cached) return cached.summary;
  const summary = buildTrustSummary(userId);
  CACHE[userId] = { summary, updatedAt: summary.updatedAt };
  return summary;
}

/** 16단계: 신뢰도 재계산 placeholder - 캐시 무효화 후 재계산 */
export function recalculateTrustForUser(userId: string): AdminTrustSummary {
  delete CACHE[userId];
  return getAdminTrustSummary(userId);
}

/** 목록용: 리뷰 대상자들 + 기타 유저 */
export function getAdminTrustSummaryUserIds(): string[] {
  const set = new Set<string>();
  MOCK_REVIEWS.forEach((r) => {
    set.add(r.reviewerId);
    set.add(r.targetUserId);
  });
  return Array.from(set);
}
