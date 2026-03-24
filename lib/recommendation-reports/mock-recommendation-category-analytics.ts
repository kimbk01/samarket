/**
 * 37단계: 카테고리별 성과 분석 mock
 */

import type { RecommendationCategoryAnalytics } from "@/lib/types/recommendation-report";

const CATEGORIES: RecommendationCategoryAnalytics[] = [];

const DEFAULT_CATEGORIES = ["디지털기기", "가구", "의류", "생활용품", "기타"];

export function getRecommendationCategoryAnalytics(
  reportId: string
): RecommendationCategoryAnalytics[] {
  const list = CATEGORIES.filter((c) => c.reportId === reportId);
  if (list.length > 0) return list;
  const out: RecommendationCategoryAnalytics[] = DEFAULT_CATEGORIES.map(
    (category, i) => {
      const impressionCount = 8000 + i * 3000;
      const clickCount = Math.floor(impressionCount * 0.04);
      const conversionCount = Math.floor(clickCount * 0.12);
      const row: RecommendationCategoryAnalytics = {
        id: `rca-${reportId}-${i}`,
        reportId,
        category,
        impressionCount,
        clickCount,
        ctr: 0.04,
        conversionCount,
        conversionRate: impressionCount > 0 ? conversionCount / impressionCount : 0,
      };
      CATEGORIES.push(row);
      return row;
    }
  );
  return out;
}
