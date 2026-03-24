/**
 * 40단계: 런북 실행 mock
 */

import type {
  OpsRunbookExecution,
  OpsRunbookExecutionStatus,
  OpsRunbookLinkedType,
} from "@/lib/types/ops-runbook";

const EXECUTIONS: OpsRunbookExecution[] = [
  {
    id: "ore-1",
    documentId: "od-1",
    documentTitle: "추천 피드 Fallback 대응 플레이북",
    documentType: "playbook",
    linkedType: "incident",
    linkedId: "inc-1",
    executionStatus: "in_progress",
    startedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    completedAt: null,
    startedByAdminId: "admin1",
    startedByAdminNickname: "관리자",
    summary: "Fallback 발생 대응 진행 중",
    resultNote: "",
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "ore-2",
    documentId: "od-3",
    documentTitle: "추천 버전 롤백 시나리오",
    documentType: "scenario",
    linkedType: "rollback",
    linkedId: "rd-1",
    executionStatus: "completed",
    startedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    completedAt: new Date(Date.now() - 23 * 3600000).toISOString(),
    startedByAdminId: "admin1",
    startedByAdminNickname: "관리자",
    summary: "롤백 완료, 지표 정상화",
    resultNote: "이전 버전으로 롤백 후 CTR 복구 확인",
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 23 * 3600000).toISOString(),
  },
];

export function getOpsRunbookExecutions(filters?: {
  status?: OpsRunbookExecutionStatus;
  linkedType?: OpsRunbookLinkedType;
  documentId?: string;
  limit?: number;
}): OpsRunbookExecution[] {
  let list = [...EXECUTIONS].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  if (filters?.status) list = list.filter((e) => e.executionStatus === filters.status);
  if (filters?.linkedType) list = list.filter((e) => e.linkedType === filters.linkedType);
  if (filters?.documentId) list = list.filter((e) => e.documentId === filters.documentId);
  const limit = filters?.limit ?? 100;
  return list.slice(0, limit);
}

export function getOpsRunbookExecutionById(id: string): OpsRunbookExecution | undefined {
  return EXECUTIONS.find((e) => e.id === id);
}

export function addOpsRunbookExecution(
  input: Omit<OpsRunbookExecution, "id" | "createdAt" | "updatedAt">
): OpsRunbookExecution {
  const now = new Date().toISOString();
  const exec: OpsRunbookExecution = {
    ...input,
    id: `ore-${Date.now()}`,
    createdAt: input.startedAt,
    updatedAt: now,
  };
  EXECUTIONS.unshift(exec);
  return exec;
}

export function updateOpsRunbookExecution(
  id: string,
  update: Partial<Pick<OpsRunbookExecution, "executionStatus" | "completedAt" | "summary" | "resultNote">>
): OpsRunbookExecution | null {
  const exec = EXECUTIONS.find((e) => e.id === id);
  if (!exec) return null;
  const now = new Date().toISOString();
  Object.assign(exec, update, { updatedAt: now });
  return { ...exec };
}
