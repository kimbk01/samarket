/**
 * 50단계: 운영 루틴 요약 (완료율·overdue·carry-over)
 */

import { getOpsRoutineExecutions } from "./mock-ops-routine-executions";
import type { OpsRoutineSummary } from "@/lib/types/ops-routines";

export function getOpsRoutineSummary(): OpsRoutineSummary {
  const all = getOpsRoutineExecutions();
  const totalRoutines = all.length;
  const completedRoutines = all.filter((e) => e.status === "done").length;
  const overdueRoutines = all.filter((e) => e.status === "overdue").length;
  const carryOverRoutines = all.filter((e) => e.carryOverToNextPeriod).length;

  const monthly = getOpsRoutineExecutions({ periodType: "monthly" });
  const monthlyTotal = monthly.length;
  const monthlyDone = monthly.filter((e) => e.status === "done").length;
  const monthlyCompletionRate =
    monthlyTotal > 0 ? Math.round((monthlyDone / monthlyTotal) * 100) : 0;

  const weekly = getOpsRoutineExecutions({ periodType: "weekly" });
  const weeklyTotal = weekly.length;
  const weeklyDone = weekly.filter((e) => e.status === "done").length;
  const weeklyCompletionRate =
    weeklyTotal > 0 ? Math.round((weeklyDone / weeklyTotal) * 100) : 0;

  const quarterly = getOpsRoutineExecutions({ periodType: "quarterly" });
  const quarterlyTotal = quarterly.length;
  const quarterlyDone = quarterly.filter((e) => e.status === "done").length;
  const quarterlyCompletionRate =
    quarterlyTotal > 0
      ? Math.round((quarterlyDone / quarterlyTotal) * 100)
      : 0;

  const latestUpdatedAt =
    all.length > 0
      ? all.reduce((max, e) => (e.updatedAt > max ? e.updatedAt : max), all[0].updatedAt)
      : null;

  return {
    totalRoutines,
    completedRoutines,
    overdueRoutines,
    carryOverRoutines,
    monthlyCompletionRate,
    weeklyCompletionRate,
    quarterlyCompletionRate,
    latestUpdatedAt,
  };
}
