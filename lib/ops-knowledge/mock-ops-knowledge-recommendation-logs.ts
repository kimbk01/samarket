/**
 * 41단계: 문서 추천 로그 mock
 */

import type {
  OpsKnowledgeRecommendationLog,
  OpsKnowledgeRecommendSourceType,
} from "@/lib/types/ops-knowledge";

const LOGS: OpsKnowledgeRecommendationLog[] = [
  {
    id: "okrl-1",
    sourceType: "incident",
    sourceId: "inc-1",
    recommendedDocumentId: "od-1",
    recommendationReason: "category: incident_response, tag: fallback",
    score: 0.95,
    clicked: true,
    clickedAt: new Date(Date.now() - 3600000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: "okrl-2",
    sourceType: "rollback",
    sourceId: null,
    recommendedDocumentId: "od-3",
    recommendationReason: "category: rollback",
    score: 0.9,
    clicked: false,
    clickedAt: null,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

export function getOpsKnowledgeRecommendationLogs(options?: {
  limit?: number;
  sourceType?: OpsKnowledgeRecommendSourceType;
}): OpsKnowledgeRecommendationLog[] {
  let list = [...LOGS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (options?.sourceType) list = list.filter((l) => l.sourceType === options.sourceType);
  const limit = options?.limit ?? 50;
  return list.slice(0, limit);
}

export function addOpsKnowledgeRecommendationLog(
  input: Omit<OpsKnowledgeRecommendationLog, "id" | "createdAt">
): OpsKnowledgeRecommendationLog {
  const log: OpsKnowledgeRecommendationLog = {
    ...input,
    id: `okrl-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  LOGS.unshift(log);
  return log;
}

export function setOpsKnowledgeRecommendationLogClicked(
  logId: string
): void {
  const log = LOGS.find((l) => l.id === logId);
  if (log) {
    log.clicked = true;
    log.clickedAt = new Date().toISOString();
  }
}

export function findRecommendationLog(
  sourceType: OpsKnowledgeRecommendSourceType,
  sourceId: string | null,
  recommendedDocumentId: string
): OpsKnowledgeRecommendationLog | undefined {
  return LOGS.find(
    (l) =>
      l.sourceType === sourceType &&
      l.sourceId === sourceId &&
      l.recommendedDocumentId === recommendedDocumentId
  );
}
