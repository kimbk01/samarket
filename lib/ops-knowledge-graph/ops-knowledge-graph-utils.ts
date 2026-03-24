/**
 * 42단계: 그래프 노드/엣지 조회, 유사 문서, 랭킹 조합
 */

import { getOpsKnowledgeGraphNodes } from "./mock-ops-knowledge-graph-nodes";
import { getOpsKnowledgeGraphEdges } from "./mock-ops-knowledge-graph-edges";
import { getOpsKnowledgeGraphNodeById } from "./mock-ops-knowledge-graph-nodes";

export function getEdgesForNode(nodeId: string) {
  const out = getOpsKnowledgeGraphEdges({ sourceNodeId: nodeId });
  const in_ = getOpsKnowledgeGraphEdges({ targetNodeId: nodeId });
  return { outgoing: out, incoming: in_ };
}

export function getConnectedNodes(nodeId: string) {
  const { outgoing, incoming } = getEdgesForNode(nodeId);
  const ids = new Set<string>();
  outgoing.forEach((e) => ids.add(e.targetNodeId));
  incoming.forEach((e) => ids.add(e.sourceNodeId));
  return Array.from(ids)
    .map((id) => getOpsKnowledgeGraphNodeById(id))
    .filter((n): n is NonNullable<typeof n> => n != null);
}

export function getTopLinkedDocumentIds(limit = 10): string[] {
  const edges = getOpsKnowledgeGraphEdges({ limit: 200 });
  const docCount: Record<string, number> = {};
  for (const e of edges) {
    const targetId = e.targetNodeId.startsWith("okgn-doc-")
      ? e.targetNodeId.replace("okgn-doc-", "")
      : null;
    if (targetId) {
      docCount[targetId] = (docCount[targetId] ?? 0) + 1;
    }
  }
  return Object.entries(docCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}
