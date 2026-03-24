/**
 * 40단계: 런북 실행 요약 mock
 */

import type { OpsRunbookSummary } from "@/lib/types/ops-runbook";
import { getOpsRunbookExecutions } from "./mock-ops-runbook-executions";

export function getOpsRunbookSummary(): OpsRunbookSummary {
  const all = getOpsRunbookExecutions({ limit: 1000 });
  const totalExecutions = all.length;
  const inProgressExecutions = all.filter((e) => e.executionStatus === "in_progress").length;
  const completedExecutions = all.filter((e) => e.executionStatus === "completed").length;
  const blockedExecutions = all.filter((e) => e.executionStatus === "pending").length; // placeholder: 실제로는 step blocked 개수 기반 가능
  const completedWithTime = all.filter(
    (e) => e.executionStatus === "completed" && e.completedAt && e.startedAt
  );
  let avgCompletionMinutes: number | null = null;
  if (completedWithTime.length > 0) {
    const totalMs = completedWithTime.reduce((acc, e) => {
      return acc + (new Date(e.completedAt!).getTime() - new Date(e.startedAt).getTime());
    }, 0);
    avgCompletionMinutes = Math.round(totalMs / completedWithTime.length / 60000);
  }
  const sorted = [...all].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  const latestExecutionAt = sorted[0]?.startedAt ?? null;

  return {
    totalExecutions,
    inProgressExecutions,
    completedExecutions,
    blockedExecutions,
    avgCompletionMinutes,
    latestExecutionAt,
  };
}
