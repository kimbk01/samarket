/**
 * 39단계: 문서 변경 이력 mock
 */

import type {
  OpsDocumentLog,
  OpsDocumentLogActionType,
  OpsDocumentLogActorType,
} from "@/lib/types/ops-docs";

const LOGS: OpsDocumentLog[] = [
  {
    id: "odl-1",
    documentId: "od-1",
    actionType: "create",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    note: "",
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: "odl-2",
    documentId: "od-1",
    actionType: "approve",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    note: "1.0 승인",
    createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
  },
  {
    id: "odl-3",
    documentId: "od-1",
    actionType: "update",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    note: "단계 3 링크 추가",
    createdAt: new Date().toISOString(),
  },
  {
    id: "odl-4",
    documentId: "od-2",
    actionType: "create",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    note: "",
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
  {
    id: "odl-5",
    documentId: "od-3",
    actionType: "create",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    note: "",
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: "odl-6",
    documentId: "od-4",
    actionType: "create",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    note: "초안",
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];

export function getOpsDocumentLogs(
  documentId: string,
  options?: { limit?: number }
): OpsDocumentLog[] {
  const list = LOGS.filter((l) => l.documentId === documentId).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const limit = options?.limit ?? 50;
  return list.slice(0, limit);
}

export function addOpsDocumentLog(
  input: Omit<OpsDocumentLog, "id">
): OpsDocumentLog {
  const log: OpsDocumentLog = {
    ...input,
    id: `odl-${Date.now()}`,
  };
  LOGS.unshift(log);
  return log;
}
