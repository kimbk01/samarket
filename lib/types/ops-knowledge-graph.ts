/**
 * 42단계: 운영 지식 그래프 / 유사 문서 / 해결 사례 랭킹 타입
 */

export type OpsKnowledgeGraphNodeType =
  | "document"
  | "incident"
  | "deployment"
  | "rollback"
  | "fallback"
  | "report"
  | "runbook_execution"
  | "action_item";

export type OpsKnowledgeGraphEdgeType =
  | "related_to"
  | "executed_by"
  | "recommended_for"
  | "derived_from"
  | "resolved_with"
  | "followup_of";

export interface OpsKnowledgeGraphNode {
  id: string;
  nodeType: OpsKnowledgeGraphNodeType;
  refId: string;
  title: string;
  category: string | null;
  surface: string | null;
  status: string | null;
  createdAt: string;
  updatedAt: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface OpsKnowledgeGraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: OpsKnowledgeGraphEdgeType;
  weight: number;
  createdAt: string;
  note: string;
}

export interface OpsSimilarDocumentRecommendation {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  similarityScore: number;
  reasonLabels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OpsKnowledgeDocumentRanking {
  id: string;
  documentId: string;
  rankingScore: number;
  viewCount: number;
  recommendationClickCount: number;
  incidentLinkCount: number;
  resolvedWithCount: number;
  recentUpdateBoost: number;
  runbookExecutionCount: number;
  successfulExecutionRate: number | null;
  updatedAt: string;
}

export type OpsResolutionOutcomeType =
  | "resolved"
  | "mitigated"
  | "rolled_back"
  | "fallback_applied"
  | "escalated";

export interface OpsResolutionCase {
  id: string;
  incidentId: string;
  primaryDocumentId: string;
  relatedRunbookExecutionId: string | null;
  outcomeType: OpsResolutionOutcomeType;
  effectivenessScore: number | null;
  createdAt: string;
  note: string;
}

export interface OpsKnowledgeGraphSummary {
  totalNodes: number;
  totalEdges: number;
  totalDocumentNodes: number;
  totalIncidentNodes: number;
  totalResolutionCases: number;
  topDocumentId: string | null;
  latestUpdatedAt: string | null;
}
