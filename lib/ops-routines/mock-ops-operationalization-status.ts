/**
 * 50단계: 장기 운영 정착 상태 mock (완료율·overdue·문서 최신화 기준)
 */

import type {
  OpsOperationalizationStatus,
  OpsOperationalizationStatusType,
} from "@/lib/types/ops-routines";
import { getOpsRoutineSummary } from "./mock-ops-routine-summary";

const now = new Date().toISOString();

export function getOpsOperationalizationStatus(): OpsOperationalizationStatus {
  const summary = getOpsRoutineSummary();
  const completionRate = summary.monthlyCompletionRate;
  const overdueCount = summary.overdueRoutines;
  const carryOverCount = summary.carryOverRoutines;

  let overallStatus: OpsOperationalizationStatusType = "stabilizing";
  if (overdueCount > 3 || completionRate < 50) overallStatus = "needs_attention";
  else if (completionRate >= 90 && carryOverCount === 0)
    overallStatus = "optimized";
  else if (completionRate >= 75 && overdueCount === 0)
    overallStatus = "established";

  return {
    id: "oos-1",
    evaluatedAt: now,
    overallStatus,
    routineCompletionRate: completionRate,
    overdueRoutineCount: overdueCount,
    carryOverCount,
    documentationFreshnessRate: 78,
    actionClosureRate: 82,
    monthlyReviewDone: true,
    benchmarkReviewDone: true,
    note: "",
  };
}
