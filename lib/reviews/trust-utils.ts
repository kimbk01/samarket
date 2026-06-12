/**
 * 프로필 trust_score 미로드 시 기본 신뢰 요약.
 * 실제 후기 집계는 `resolveProfileTrustScore`·`/api/my/received-reviews` 경로 사용.
 */

import type { UserTrustSummary } from "@/lib/types/review";
import { TRUST_SCORE_DEFAULT } from "@/lib/trust/trust-score-core";

export function getTrustSummary(userId: string): UserTrustSummary {
  return {
    userId,
    reviewCount: 0,
    averageRating: 0,
    mannerScore: TRUST_SCORE_DEFAULT,
    positiveCount: 0,
    negativeCount: 0,
    summaryTags: [],
  };
}
