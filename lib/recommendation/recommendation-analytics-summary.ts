import type { RecommendationAnalyticsSummary } from "@/lib/types/recommendation";
import { getImpressions } from "@/lib/recommendation-analytics/recommendation-analytics-state";
import { buildAnalyticsSummaryFromImpressions } from "@/lib/recommendation/recommendation-analytics-utils";

export function getRecommendationAnalyticsSummary(): RecommendationAnalyticsSummary[] {
  return buildAnalyticsSummaryFromImpressions(getImpressions());
}
