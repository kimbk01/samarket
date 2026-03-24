/**
 * 42단계: 문서 랭킹 mock (조회/추천클릭/incident연결/해결/업데이트/실행수 기반)
 */

import type { OpsKnowledgeDocumentRanking } from "@/lib/types/ops-knowledge-graph";
import { getOpsDocuments } from "@/lib/ops-docs/mock-ops-documents";
import { getOpsRunbookExecutions } from "@/lib/ops-runbooks/mock-ops-runbook-executions";
import { getOpsKnowledgeGraphEdges } from "./mock-ops-knowledge-graph-edges";

const RANKINGS: OpsKnowledgeDocumentRanking[] = [];
let initialized = false;

function buildRankings(): void {
  if (initialized) return;
  initialized = true;
  const docs = getOpsDocuments({ limit: 50 });
  const execs = getOpsRunbookExecutions({ limit: 100 });
  const edges = getOpsKnowledgeGraphEdges({ limit: 200 });
  const now = new Date().toISOString();

  const execCountByDoc: Record<string, number> = {};
  const resolvedWithByDoc: Record<string, number> = {};
  for (const e of execs) {
    execCountByDoc[e.documentId] = (execCountByDoc[e.documentId] ?? 0) + 1;
  }
  for (const edge of edges) {
    if (edge.edgeType === "resolved_with") {
      const docNodeId = edge.targetNodeId;
      const docId = docNodeId.replace("okgn-doc-", "");
      resolvedWithByDoc[docId] = (resolvedWithByDoc[docId] ?? 0) + 1;
    }
  }

  for (const d of docs) {
    const viewCount = d.isPinned ? 10 : 3;
    const recommendationClickCount = d.isPinned ? 5 : 1;
    const incidentLinkCount = d.category === "incident_response" ? 2 : 0;
    const resolvedWithCount = resolvedWithByDoc[d.id] ?? 0;
    const runbookExecutionCount = execCountByDoc[d.id] ?? 0;
    const daysSinceUpdate = (Date.now() - new Date(d.updatedAt).getTime()) / 86400000;
    const recentUpdateBoost = Math.max(0, 1 - daysSinceUpdate / 30);
    const rankingScore =
      viewCount * 0.1 +
      recommendationClickCount * 0.3 +
      incidentLinkCount * 0.2 +
      resolvedWithCount * 0.25 +
      recentUpdateBoost * 0.15 +
      runbookExecutionCount * 0.1;

    RANKINGS.push({
      id: `okdr-${d.id}`,
      documentId: d.id,
      rankingScore: Math.round(rankingScore * 100) / 100,
      viewCount,
      recommendationClickCount,
      incidentLinkCount,
      resolvedWithCount,
      recentUpdateBoost: Math.round(recentUpdateBoost * 100) / 100,
      runbookExecutionCount,
      successfulExecutionRate: runbookExecutionCount > 0 ? 0.85 : null,
      updatedAt: now,
    });
  }

  RANKINGS.sort((a, b) => b.rankingScore - a.rankingScore);
}

export function getOpsKnowledgeDocumentRankings(filters?: {
  limit?: number;
}): OpsKnowledgeDocumentRanking[] {
  buildRankings();
  const limit = filters?.limit ?? 50;
  return RANKINGS.slice(0, limit);
}

export function getOpsKnowledgeDocumentRankingByDocumentId(
  documentId: string
): OpsKnowledgeDocumentRanking | undefined {
  buildRankings();
  return RANKINGS.find((r) => r.documentId === documentId);
}
