import type { RecommendationAnalyticsSummary } from "@/lib/types/recommendation";
import { getRecommendationAnalyticsSummaryFromRecords } from "@/lib/recommendation-ops/recommendation-records-summary-state";

/** surface·섹션별 노출 성과 — 테이블 recommendation_impressions 전체를 DB 요약 RPC 로 집계 (예전: 메모리 최대 500건). */
export function getRecommendationAnalyticsSummary(): RecommendationAnalyticsSummary[] {
  return getRecommendationAnalyticsSummaryFromRecords();
}
