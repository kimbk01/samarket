/**
 * 43단계: 패턴 로그 mock
 */

import type { OpsPatternLog, OpsPatternLogActionType } from "@/lib/types/ops-learning";

const LOGS: OpsPatternLog[] = [
  {
    id: "opl-1",
    patternId: "oip-1",
    actionType: "detect",
    actorType: "system",
    actorId: "system",
    actorNickname: "시스템",
    note: "반복 패턴 탐지",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "opl-2",
    patternId: "oip-1",
    actionType: "link_document",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    note: "od-1 플레이북 연결",
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: "opl-3",
    patternId: "oip-2",
    actionType: "mark_mitigated",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    note: "롤백 시나리오 적용으로 완화",
    createdAt: new Date(Date.now() - 23 * 3600000).toISOString(),
  },
];

export function getOpsPatternLogs(patternId: string, options?: { limit?: number }): OpsPatternLog[] {
  const list = LOGS.filter((l) => l.patternId === patternId).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const limit = options?.limit ?? 30;
  return list.slice(0, limit);
}

export function addOpsPatternLog(
  input: Omit<OpsPatternLog, "id">
): OpsPatternLog {
  const log: OpsPatternLog = {
    ...input,
    id: `opl-${Date.now()}`,
  };
  LOGS.unshift(log);
  return log;
}
