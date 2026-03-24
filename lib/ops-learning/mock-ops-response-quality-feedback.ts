/**
 * 43단계: 대응 품질 피드백 mock (incident vs runbook 결과 비교)
 */

import type { OpsResponseQualityFeedback } from "@/lib/types/ops-learning";

const FEEDBACK: OpsResponseQualityFeedback[] = [
  {
    id: "orqf-1",
    incidentId: "ri-1",
    runbookExecutionId: null,
    primaryDocumentId: "od-1",
    responseQualityScore: 0.8,
    resolutionSpeedScore: 0.75,
    documentFitScore: 0.85,
    automationHelpScore: null,
    followupNeeded: false,
    feedbackSummary: "빈 피드 이슈에 플레이북 참조로 대응, 해결 시간 단축",
    createdAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
  },
  {
    id: "orqf-2",
    incidentId: "inc-1",
    runbookExecutionId: "ore-1",
    primaryDocumentId: "od-1",
    responseQualityScore: 0.9,
    resolutionSpeedScore: 0.85,
    documentFitScore: 0.9,
    automationHelpScore: 0.7,
    followupNeeded: true,
    feedbackSummary: "Fallback 대응 플레이북 실행, 결과 양호. 후속 모니터링 필요",
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
  },
  {
    id: "orqf-3",
    incidentId: "deploy-1",
    runbookExecutionId: "ore-2",
    primaryDocumentId: "od-3",
    responseQualityScore: 0.95,
    resolutionSpeedScore: 0.9,
    documentFitScore: 0.95,
    automationHelpScore: null,
    followupNeeded: true,
    feedbackSummary: "롤백 시나리오 적용 완료, 지표 정상화",
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
  },
];

export function getOpsResponseQualityFeedback(filters?: {
  incidentId?: string;
  limit?: number;
}): OpsResponseQualityFeedback[] {
  let list = [...FEEDBACK].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.incidentId) list = list.filter((f) => f.incidentId === filters.incidentId);
  const limit = filters?.limit ?? 30;
  return list.slice(0, limit);
}
