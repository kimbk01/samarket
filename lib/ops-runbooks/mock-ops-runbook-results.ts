/**
 * 40단계: 런북 대응 결과 mock
 */

import type { OpsRunbookResult, OpsRunbookOutcomeType, OpsRunbookSeverityAfter } from "@/lib/types/ops-runbook";

const RESULTS: OpsRunbookResult[] = [
  {
    id: "orr-1",
    executionId: "ore-2",
    outcomeType: "rolled_back",
    severityAfter: "low",
    summary: "이전 안정 버전으로 롤백 후 지표 정상화",
    rootCause: "신규 버전에서 특정 트래픽 구간에서 스코어 계산 이슈 추정",
    followupNeeded: true,
    createdAt: new Date(Date.now() - 23 * 3600000).toISOString(),
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
  },
];

export function getOpsRunbookResults(executionId: string): OpsRunbookResult[] {
  return RESULTS.filter((r) => r.executionId === executionId).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getOpsRunbookResultById(id: string): OpsRunbookResult | undefined {
  return RESULTS.find((r) => r.id === id);
}

export function addOpsRunbookResult(
  input: Omit<OpsRunbookResult, "id">
): OpsRunbookResult {
  const result: OpsRunbookResult = {
    ...input,
    id: `orr-${Date.now()}`,
  };
  RESULTS.unshift(result);
  return result;
}
