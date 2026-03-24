/**
 * 45단계: 분기 계획 요약 mock
 */

import {
  getOpsQuarterlyPlans,
  getCurrentQuarter,
} from "./mock-ops-quarterly-plans";
import type { OpsQuarterlyPlanSummary } from "@/lib/types/ops-benchmarks";

export function getOpsQuarterlyPlanSummary(
  year?: number
): OpsQuarterlyPlanSummary {
  const y = year ?? new Date().getFullYear();
  const list = getOpsQuarterlyPlans({ year: y });
  const plannedCount = list.filter((p) => p.status === "planned").length;
  const inProgressCount = list.filter((p) => p.status === "in_progress").length;
  const atRiskCount = list.filter((p) => p.status === "at_risk").length;
  const completedCount = list.filter((p) => p.status === "completed").length;
  const criticalOpenCount = list.filter(
    (p) => p.priority === "critical" && !["completed", "dropped"].includes(p.status)
  ).length;
  const latestUpdatedAt =
    list.length > 0
      ? list.reduce(
          (max, p) => (p.updatedAt > max ? p.updatedAt : max),
          list[0].updatedAt
        )
      : null;

  return {
    totalPlans: list.length,
    plannedCount,
    inProgressCount,
    atRiskCount,
    completedCount,
    criticalOpenCount,
    currentQuarter: getCurrentQuarter(),
    latestUpdatedAt,
  };
}
