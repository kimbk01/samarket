/**
 * 41단계: 지식베이스 검색 로그 mock
 */

import type { OpsKnowledgeSearchLog } from "@/lib/types/ops-knowledge";

const LOGS: OpsKnowledgeSearchLog[] = [
  {
    id: "oksl-1",
    adminId: "admin1",
    adminNickname: "관리자",
    query: "fallback",
    filters: {},
    resultCount: 2,
    clickedDocumentId: "od-1",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "oksl-2",
    adminId: "admin1",
    adminNickname: "관리자",
    query: "롤백",
    filters: { category: "rollback" },
    resultCount: 1,
    clickedDocumentId: "od-3",
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

export function getOpsKnowledgeSearchLogs(options?: {
  limit?: number;
  adminId?: string;
}): OpsKnowledgeSearchLog[] {
  let list = [...LOGS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (options?.adminId) list = list.filter((l) => l.adminId === options.adminId);
  const limit = options?.limit ?? 50;
  return list.slice(0, limit);
}

export function addOpsKnowledgeSearchLog(
  input: Omit<OpsKnowledgeSearchLog, "id" | "createdAt">
): OpsKnowledgeSearchLog {
  const log: OpsKnowledgeSearchLog = {
    ...input,
    id: `oksl-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  LOGS.unshift(log);
  return log;
}

export function updateOpsKnowledgeSearchLogClick(
  logId: string,
  clickedDocumentId: string
): void {
  const log = LOGS.find((l) => l.id === logId);
  if (log) log.clickedDocumentId = clickedDocumentId;
}
