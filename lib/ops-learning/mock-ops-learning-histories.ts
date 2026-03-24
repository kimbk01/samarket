/**
 * 43단계: 운영 학습 히스토리 mock
 */

import type { OpsLearningHistory, OpsLearningStatus } from "@/lib/types/ops-learning";

const HISTORIES: OpsLearningHistory[] = [
  {
    id: "olh-1",
    title: "홈 빈 피드 반복 이슈",
    summary: "empty_feed_spike가 home surface에서 반복 발생",
    sourceType: "incident",
    sourceId: "ri-1",
    surface: "home",
    learningType: "repeated_issue",
    status: "reviewing",
    detectedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    note: "",
  },
  {
    id: "olh-2",
    title: "롤백 시나리오 문서 활용 개선",
    summary: "runbook 결과와 incident outcome 비교 후 문서 적합도 개선 제안",
    sourceType: "runbook",
    sourceId: "ore-2",
    surface: "all",
    learningType: "quality_improvement",
    status: "action_created",
    detectedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    note: "액션아이템 oai-1 연결",
  },
  {
    id: "olh-3",
    title: "Fallback 대응 문서 갭",
    summary: "documentFitScore 낮음으로 문서 보강 제안",
    sourceType: "incident",
    sourceId: "inc-1",
    surface: "home",
    learningType: "document_gap",
    status: "detected",
    detectedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    ownerAdminId: null,
    ownerAdminNickname: null,
    note: "",
  },
];

export function getOpsLearningHistories(filters?: {
  status?: OpsLearningStatus;
  learningType?: string;
  surface?: string;
  limit?: number;
}): OpsLearningHistory[] {
  let list = [...HISTORIES].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  );
  if (filters?.status) list = list.filter((h) => h.status === filters.status);
  if (filters?.learningType) list = list.filter((h) => h.learningType === filters.learningType);
  if (filters?.surface) list = list.filter((h) => h.surface === filters.surface);
  const limit = filters?.limit ?? 50;
  return list.slice(0, limit);
}

export function getOpsLearningHistoryById(id: string): OpsLearningHistory | undefined {
  return HISTORIES.find((h) => h.id === id);
}
