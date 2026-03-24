/**
 * 41단계: 문서 추천 결과 mock (linkedType/category/tag 기반)
 */

import type {
  OpsKnowledgeRecommendations,
  OpsKnowledgeRecommendationItem,
  OpsKnowledgeRecommendSourceType,
} from "@/lib/types/ops-knowledge";
import { getOpsKnowledgeBaseIndex } from "./mock-ops-knowledge-base-index";

function scoreByMatch(
  sourceType: OpsKnowledgeRecommendSourceType,
  item: { linkedTypes: string[]; category: string; tags: string[]; isPinned: boolean }
): number {
  let s = 0.5;
  if (item.linkedTypes.includes(sourceType)) s += 0.35;
  if (item.category === "incident_response" && ["incident", "fallback", "kill_switch"].includes(sourceType)) s += 0.2;
  if (item.category === "rollback" && sourceType === "rollback") s += 0.2;
  if (item.category === "deployment" && sourceType === "deployment") s += 0.2;
  if (item.tags.includes(sourceType)) s += 0.1;
  if (item.isPinned) s += 0.1;
  return Math.min(1, s);
}

function reasonLabel(
  sourceType: OpsKnowledgeRecommendSourceType,
  item: { linkedTypes: string[]; category: string }
): string {
  if (item.linkedTypes.includes(sourceType)) return `연결 유형: ${sourceType}`;
  if (item.category === "incident_response") return "카테고리: 인시던트 대응";
  if (item.category === "rollback") return "카테고리: 롤백";
  if (item.category === "deployment") return "카테고리: 배포";
  return "관련 문서";
}

export function getOpsKnowledgeRecommendations(
  sourceType: OpsKnowledgeRecommendSourceType,
  sourceId: string | null,
  options?: { limit?: number }
): OpsKnowledgeRecommendations {
  const indexItems = getOpsKnowledgeBaseIndex({ status: "active", limit: 30 });
  const limit = options?.limit ?? 10;

  const scored: { item: (typeof indexItems)[0]; score: number; reasonLabel: string }[] = [];
  for (const item of indexItems) {
    const score = scoreByMatch(sourceType, item);
    if (score <= 0.5) continue;
    scored.push({
      item,
      score,
      reasonLabel: reasonLabel(sourceType, item),
    });
  }
  scored.sort((a, b) => b.score - a.score);

  const items: OpsKnowledgeRecommendationItem[] = scored.slice(0, limit).map(({ item, score, reasonLabel: r }) => ({
    documentId: item.documentId,
    title: item.title,
    docType: item.docType,
    category: item.category,
    reasonLabel: r,
    score,
    summary: item.summary,
  }));

  return {
    sourceType,
    sourceId,
    items,
  };
}
