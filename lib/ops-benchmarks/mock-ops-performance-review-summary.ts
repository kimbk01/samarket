/**
 * 45단계: 성과 리뷰 요약 mock
 */

import { getOpsAdminPerformanceReviews } from "./mock-ops-admin-performance-reviews";
import type { OpsPerformanceReviewSummary } from "@/lib/types/ops-benchmarks";

export function getOpsPerformanceReviewSummary(
  reviewPeriod?: string
): OpsPerformanceReviewSummary {
  const period =
    reviewPeriod ?? new Date().toISOString().slice(0, 7);
  const list = getOpsAdminPerformanceReviews({
    reviewPeriod: period,
    status: "published",
  });
  const totalReviewedAdmins = list.length;
  const averageOverallPerformanceScore =
    list.length > 0
      ? Math.round(
          list.reduce((a, r) => a + r.overallPerformanceScore, 0) / list.length
        )
      : 0;
  const highPerformersCount = list.filter(
    (r) => r.overallPerformanceScore >= 80
  ).length;
  const needsAttentionCount = list.filter(
    (r) => r.overallPerformanceScore < 75
  ).length;

  return {
    totalReviewedAdmins,
    averageOverallPerformanceScore,
    highPerformersCount,
    needsAttentionCount,
    latestReviewPeriod: list.length > 0 ? period : null,
  };
}
