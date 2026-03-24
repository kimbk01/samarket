/**
 * 40단계: 런북 실행 로그 mock
 */

import type {
  OpsRunbookExecutionLog,
  OpsRunbookLogActionType,
} from "@/lib/types/ops-runbook";

const LOGS: OpsRunbookExecutionLog[] = [
  {
    id: "orel-1",
    executionId: "ore-1",
    actionType: "start_execution",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    stepId: null,
    note: "incident inc-1 연동",
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: "orel-2",
    executionId: "ore-1",
    actionType: "start_step",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    stepId: "ores-1",
    note: "",
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: "orel-3",
    executionId: "ore-1",
    actionType: "complete_step",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    stepId: "ores-1",
    note: "Fallback 확인됨",
    createdAt: new Date(Date.now() - 1.5 * 3600000).toISOString(),
  },
  {
    id: "orel-4",
    executionId: "ore-1",
    actionType: "start_step",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    stepId: "ores-2",
    note: "",
    createdAt: new Date(Date.now() - 1 * 3600000).toISOString(),
  },
  {
    id: "orel-5",
    executionId: "ore-2",
    actionType: "start_execution",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    stepId: null,
    note: "",
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
  },
  {
    id: "orel-6",
    executionId: "ore-2",
    actionType: "complete_execution",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    stepId: null,
    note: "롤백 완료",
    createdAt: new Date(Date.now() - 23 * 3600000).toISOString(),
  },
  {
    id: "orel-7",
    executionId: "ore-2",
    actionType: "write_result",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    stepId: null,
    note: "",
    createdAt: new Date(Date.now() - 23 * 3600000).toISOString(),
  },
];

export function getOpsRunbookExecutionLogs(
  executionId: string,
  options?: { limit?: number }
): OpsRunbookExecutionLog[] {
  const list = LOGS.filter((l) => l.executionId === executionId).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const limit = options?.limit ?? 50;
  return list.slice(0, limit);
}

export function addOpsRunbookExecutionLog(
  input: Omit<OpsRunbookExecutionLog, "id">
): OpsRunbookExecutionLog {
  const log: OpsRunbookExecutionLog = {
    ...input,
    id: `orel-${Date.now()}`,
  };
  LOGS.unshift(log);
  return log;
}
