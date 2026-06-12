import type { RecommendationAutomationSummary } from "@/lib/types/recommendation-automation";
import { getRecommendationAutomationPolicies } from "@/lib/recommendation-ops/recommendation-ops-state";
import { getRecommendationAutomationExecutions } from "@/lib/recommendation-ops/recommendation-runtime-state";
import { getRecommendationHealthStatuses } from "@/lib/recommendation-analytics/recommendation-health-status";

const START_OF_TODAY = new Date();
START_OF_TODAY.setHours(0, 0, 0, 0);

export function getRecommendationAutomationSummary(): RecommendationAutomationSummary {
  const policies = getRecommendationAutomationPolicies();
  const executions = getRecommendationAutomationExecutions({ limit: 500 });
  const healthStatuses = getRecommendationHealthStatuses();

  const todayExecutions = executions.filter(
    (e) => new Date(e.createdAt) >= START_OF_TODAY
  );
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  for (const e of todayExecutions) {
    if (e.status === "success") successCount++;
    else if (e.status === "failed") failedCount++;
    else skippedCount++;
  }

  let activeFallbackCount = 0;
  let activeKillSwitchCount = 0;
  for (const h of healthStatuses) {
    if (h.fallbackActive) activeFallbackCount++;
    if (h.killSwitchActive) activeKillSwitchCount++;
  }

  const latest = executions[0];

  return {
    totalPolicies: policies.length,
    activePolicies: policies.filter((p) => p.isActive).length,
    dryRunPolicies: policies.filter((p) => p.dryRunEnabled).length,
    executionsToday: todayExecutions.length,
    successCount,
    failedCount,
    skippedCount,
    activeFallbackCount,
    activeKillSwitchCount,
    latestExecutionAt: latest?.createdAt ?? null,
  };
}
