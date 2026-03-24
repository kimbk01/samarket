/**
 * 31단계: 추천 분석 요약 mock (impressions 기반 집계)
 */

import type { RecommendationAnalyticsSummary } from "@/lib/types/recommendation";
import { getImpressions } from "./mock-recommendation-impressions";
import { buildAnalyticsSummaryFromImpressions } from "./recommendation-analytics-utils";

export function getRecommendationAnalyticsSummary(): RecommendationAnalyticsSummary[] {
  const impressions = getImpressions();
  return buildAnalyticsSummaryFromImpressions(impressions);
}
