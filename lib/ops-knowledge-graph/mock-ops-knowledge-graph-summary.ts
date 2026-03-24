/**
 * 42단계: 지식 그래프 요약 mock
 */

import type { OpsKnowledgeGraphSummary } from "@/lib/types/ops-knowledge-graph";
import { getOpsKnowledgeGraphNodes } from "./mock-ops-knowledge-graph-nodes";
import { getOpsKnowledgeGraphEdges } from "./mock-ops-knowledge-graph-edges";
import { getOpsResolutionCases } from "./mock-ops-resolution-cases";
import { getOpsKnowledgeDocumentRankings } from "./mock-ops-knowledge-document-rankings";

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
