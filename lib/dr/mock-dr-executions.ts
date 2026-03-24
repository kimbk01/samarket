/**
 * 55단계: DR 실행 기록 mock
 */

import type { DrExecution, DrExecutionStatus } from "@/lib/types/dr";

const now = new Date().toISOString();

const EXECUTIONS: DrExecution[] = [
  {
    id: "dre-1",
    scenarioId: "drs-1",
    executionStatus: "completed" as DrExecutionStatus,
    startedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    completedAt: new Date(Date.now() - 14 * 86400000 + 1800000).toISOString(),
    executedByAdminId: "admin1",
  },
  {
    id: "dre-2",
    scenarioId: "drs-2",
    executionStatus: "planned" as DrExecutionStatus,
    startedAt: now,
    completedAt: null,
    executedByAdminId: null,
  },
];

export function getDrExecutions(filters?: {
  scenarioId?: string;
  executionStatus?: DrExecutionStatus;
}): DrExecution[] {
  let list = [...EXECUTIONS].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  if (filters?.scenarioId)
    list = list.filter((e) => e.scenarioId === filters.scenarioId);
  if (filters?.executionStatus)
    list = list.filter((e) => e.executionStatus === filters.executionStatus);
  return list;
}
