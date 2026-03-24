/**
 * 37단계: 추천 이유(reason label) Top N 분석 mock
 */

import type { RecommendationReasonAnalytics } from "@/lib/types/recommendation-report";

const REASONS: RecommendationReasonAnalytics[] = [];

const DEFAULT_REASON_LABELS = [
  "추천",
  "광고",
  "끌올",
  "우리동네 최신",
  "특별회원/상점",
  "최근 본 기반",
  "카테고리 기반",
  "관심 기반",
];

export function getRecommendationReasonAnalytics(
  reportId: string,
  limit = 20
): RecommendationReasonAnalytics[] {
  const list = REASONS.filter((r) => r.reportId === reportId);
  if (list.length > 0) return list.slice(0, limit);
  const out: RecommendationReasonAnalytics[] = DEFAULT_REASON_LABELS.map(
    (reasonLabel, i) => {
      const impressionCount = 5000 + (DEFAULT_REASON_LABELS.length - i) * 2000;
      const clickCount = Math.floor(impressionCount * (0.03 + Math.random() * 0.02));
      const conversionCount = Math.floor(clickCount * 0.15);
      const row: RecommendationReasonAnalytics = {
        id: `rra-${reportId}-${i}`,
        reportId,
        reasonLabel,
        impressionCount,
        clickCount,
        ctr: impressionCount > 0 ? clickCount / impressionCount : 0,
        conversionCount,
        rank: i + 1,
      };
      REASONS.push(row);
      return row;
    }
  );
  return out.slice(0, limit);
}
