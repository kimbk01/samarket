/**
 * 42단계: 지식 그래프 요약
 */

import type { OpsKnowledgeGraphSummary } from "@/lib/types/ops-knowledge-graph";
import {
  getOpsKnowledgeDocumentRankings,
  getOpsKnowledgeGraphEdges,
  getOpsKnowledgeGraphNodes,
  getOpsResolutionCases,
} from "@/lib/ops-knowledge-graph/ops-knowledge-graph-state";

export function getOpsKnowledgeGraphSummary(): OpsKnowledgeGraphSummary {
  const nodes = getOpsKnowledgeGraphNodes({ limit: 1000 });
  const edges = getOpsKnowledgeGraphEdges({ limit: 1000 });
  const cases = getOpsResolutionCases({ limit: 1000 });
  const rankings = getOpsKnowledgeDocumentRankings({ limit: 1 });

  const totalDocumentNodes = nodes.filter((n) => n.nodeType === "document").length;
  const totalIncidentNodes = nodes.filter((n) => n.nodeType === "incident").length;
  const sorted = [...nodes].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const latestUpdatedAt = sorted[0]?.updatedAt ?? null;
  const topDocumentId = rankings[0]?.documentId ?? null;

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    totalDocumentNodes,
    totalIncidentNodes,
    totalResolutionCases: cases.length,
    topDocumentId,
    latestUpdatedAt,
  };
}
