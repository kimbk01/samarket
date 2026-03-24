/**
 * 41단계: 운영 지식베이스 검색 / 문서 추천 타입
 */

export type OpsKnowledgeDocType = "sop" | "playbook" | "scenario";

export type OpsKnowledgeDocStatus = "draft" | "active" | "archived";

export type OpsKnowledgeCategory =
  | "incident_response"
  | "deployment"
  | "rollback"
  | "moderation"
  | "recommendation"
  | "ads"
  | "points"
  | "support";

export type OpsKnowledgeRecommendSourceType =
  | "incident"
  | "deployment"
  | "rollback"
  | "fallback"
  | "kill_switch"
  | "manual_search";

export type OpsKnowledgeRecentViewSourceType =
  | "search"
  | "incident"
  | "runbook"
  | "manual";

export interface OpsKnowledgeBaseIndexItem {
  id: string;
  documentId: string;
  docType: OpsKnowledgeDocType;
  title: string;
  slug: string;
  category: OpsKnowledgeCategory;
  status: OpsKnowledgeDocStatus;
  summary: string;
  tags: string[];
  keywordTokens: string[];
  linkedTypes: string[];
  updatedAt: string;
  popularityScore: number;
  isPinned: boolean;
}

export interface OpsKnowledgeSearchLog {
  id: string;
  adminId: string;
  adminNickname: string;
  query: string;
  filters: Record<string, string>;
  resultCount: number;
  clickedDocumentId: string | null;
  createdAt: string;
}

export interface OpsKnowledgeRecommendationLog {
  id: string;
  sourceType: OpsKnowledgeRecommendSourceType;
  sourceId: string | null;
  recommendedDocumentId: string;
  recommendationReason: string;
  score: number;
  clicked: boolean;
  clickedAt: string | null;
  createdAt: string;
}

export interface OpsKnowledgeRecentView {
  id: string;
  adminId: string;
  adminNickname: string;
  documentId: string;
  viewedAt: string;
  sourceType: OpsKnowledgeRecentViewSourceType;
}

export interface OpsKnowledgeRecommendationItem {
  documentId: string;
  title: string;
  docType: OpsKnowledgeDocType;
  category: OpsKnowledgeCategory;
  reasonLabel: string;
  score: number;
  summary: string;
}

export interface OpsKnowledgeRecommendations {
  sourceType: OpsKnowledgeRecommendSourceType;
  sourceId: string | null;
  items: OpsKnowledgeRecommendationItem[];
}

export interface OpsKnowledgeSummary {
  totalDocuments: number;
  activeDocuments: number;
  totalSearchesToday: number;
  totalRecommendationClicks: number;
  latestUpdatedAt: string | null;
  topCategory: string | null;
  topSearchedKeyword: string | null;
}
