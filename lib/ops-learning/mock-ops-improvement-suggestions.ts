/**
 * 43단계: 개선 제안 mock
 */

import type {
  OpsImprovementSuggestion,
  OpsSuggestionStatus,
  OpsSuggestionType,
} from "@/lib/types/ops-learning";

const SUGGESTIONS: OpsImprovementSuggestion[] = [
  {
    id: "ois-1",
    patternId: "oip-1",
    suggestionType: "document_update",
    title: "빈 피드 플레이북에 임계치 체크 단계 추가",
    description: "empty_feed_spike 발생 전 알림 임계치 검토 단계를 문서에 추가 제안",
    status: "proposed",
    linkedActionItemId: null,
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "ois-2",
    patternId: "oip-1",
    suggestionType: "alert_threshold_change",
    title: "홈 빈 피드 알림 임계치 조정",
    description: "현재 임계치로는 반복 발생 시점에 알림이 늦음. 상향 조정 검토",
    status: "approved",
    linkedActionItemId: "oai-1",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: "ois-3",
    patternId: "oip-3",
    suggestionType: "new_runbook",
    title: "Fallback 자동 복구 런북 신규 작성",
    description: "Fallback 발생 시 자동 복구 시나리오 문서화",
    status: "proposed",
    linkedActionItemId: null,
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
];

export function getOpsImprovementSuggestions(filters?: {
  patternId?: string;
  status?: OpsSuggestionStatus;
  limit?: number;
}): OpsImprovementSuggestion[] {
  let list = [...SUGGESTIONS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.patternId) list = list.filter((s) => s.patternId === filters.patternId);
  if (filters?.status) list = list.filter((s) => s.status === filters.status);
  const limit = filters?.limit ?? 30;
  return list.slice(0, limit);
}

export function getOpsImprovementSuggestionById(id: string): OpsImprovementSuggestion | undefined {
  return SUGGESTIONS.find((s) => s.id === id);
}
