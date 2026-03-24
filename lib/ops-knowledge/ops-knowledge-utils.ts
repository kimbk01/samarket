/**
 * 41단계: 검색, 추천, 로그 기록, 최근 열람
 */

import type {
  OpsKnowledgeDocType,
  OpsKnowledgeDocStatus,
  OpsKnowledgeCategory,
  OpsKnowledgeRecommendSourceType,
  OpsKnowledgeRecentViewSourceType,
} from "@/lib/types/ops-knowledge";
import { getOpsKnowledgeBaseIndex } from "./mock-ops-knowledge-base-index";
import { getOpsKnowledgeRecommendations } from "./mock-ops-knowledge-recommendations";
import { addOpsKnowledgeSearchLog } from "./mock-ops-knowledge-search-logs";
import { addOpsKnowledgeRecommendationLog } from "./mock-ops-knowledge-recommendation-logs";
import { setOpsKnowledgeRecommendationLogClicked, findRecommendationLog } from "./mock-ops-knowledge-recommendation-logs";
import { addOpsKnowledgeRecentView } from "./mock-ops-knowledge-recent-views";

const ADMIN_ID = "admin1";
const ADMIN_NICK = "관리자";

export interface OpsKnowledgeSearchFilters {
  docType?: OpsKnowledgeDocType;
  status?: OpsKnowledgeDocStatus;
  category?: OpsKnowledgeCategory;
}

export function searchOpsKnowledge(
  query: string,
  filters?: OpsKnowledgeSearchFilters,
  options?: { limit?: number }
) {
  const list = getOpsKnowledgeBaseIndex({
    query: query.trim() || undefined,
    docType: filters?.docType,
    status: filters?.status ?? "active",
    category: filters?.category,
    limit: options?.limit ?? 50,
  });
  return list;
}

export function logOpsKnowledgeSearch(
  query: string,
  filters: Record<string, string>,
  resultCount: number,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICK
) {
  return addOpsKnowledgeSearchLog({
    adminId,
    adminNickname,
    query,
    filters,
    resultCount,
    clickedDocumentId: null,
  });
}

export function getRecommendationsForSource(
  sourceType: OpsKnowledgeRecommendSourceType,
  sourceId: string | null,
  limit = 10
) {
  return getOpsKnowledgeRecommendations(sourceType, sourceId, { limit });
}

export function logRecommendationClick(
  sourceType: OpsKnowledgeRecommendSourceType,
  sourceId: string | null,
  recommendedDocumentId: string
) {
  const existing = findRecommendationLog(sourceType, sourceId, recommendedDocumentId);
  if (existing) setOpsKnowledgeRecommendationLogClicked(existing.id);
  else {
    addOpsKnowledgeRecommendationLog({
      sourceType,
      sourceId,
      recommendedDocumentId,
      recommendationReason: "click",
      score: 1,
      clicked: true,
      clickedAt: new Date().toISOString(),
    });
  }
}

export function addRecentView(
  documentId: string,
  sourceType: OpsKnowledgeRecentViewSourceType,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICK
) {
  return addOpsKnowledgeRecentView({
    adminId,
    adminNickname,
    documentId,
    viewedAt: new Date().toISOString(),
    sourceType,
  });
}
