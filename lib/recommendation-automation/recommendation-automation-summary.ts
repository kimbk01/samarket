import type { RecommendationAutomationSummary } from "@/lib/types/recommendation-automation";
import { getRecommendationAutomationPolicies } from "@/lib/recommendation-ops/recommendation-ops-state";
import { getRecommendationRecordsSummary } from "@/lib/recommendation-ops/recommendation-records-summary-state";
import { getRecommendationHealthStatuses } from "@/lib/recommendation-analytics/recommendation-health-status";

export function getRecommendationAutomationSummary(): RecommendationAutomationSummary {
  const policies = getRecommendationAutomationPolicies();
  /** 오늘(마닐라 0시부터) 실행 수·결과별 수·최근 실행 시각 = DB 요약 RPC (전체 기록 기준 — R7 후속). */
  const executions = getRecommendationRecordsSummary().executions;
  const healthStatuses = getRecommendationHealthStatuses();

  let activeFallbackCount = 0;
  let activeKillSwitchCount = 0;
  for (const h of healthStatuses) {
    if (h.fallbackActive) activeFallbackCount++;
    if (h.killSwitchActive) activeKillSwitchCount++;
  }

  return {
    totalPolicies: policies.length,
    activePolicies: policies.filter((p) => p.isActive).length,
    dryRunPolicies: policies.filter((p) => p.dryRunEnabled).length,
    executionsToday: executions.since.total,
    successCount: executions.since.success,
    failedCount: executions.since.failed,
    skippedCount: executions.since.skipped,
    activeFallbackCount,
    activeKillSwitchCount,
    latestExecutionAt: executions.latestCreatedAt,
  };
}
