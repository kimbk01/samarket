/**
 * 42단계: 지식 그래프 노드 mock (39/40/35/33/37/38 기반)
 */

import type { OpsKnowledgeGraphNode, OpsKnowledgeGraphNodeType } from "@/lib/types/ops-knowledge-graph";
import { getOpsDocuments } from "@/lib/ops-docs/mock-ops-documents";
import { getOpsRunbookExecutions } from "@/lib/ops-runbooks/mock-ops-runbook-executions";

const NODES: OpsKnowledgeGraphNode[] = [];

function ensureNode(node: OpsKnowledgeGraphNode): void {
  if (!NODES.find((n) => n.id === node.id)) NODES.push(node);
}

function buildNodesFromDocs(): void {
  const docs = getOpsDocuments({ limit: 100 });
  for (const d of docs) {
    ensureNode({
      id: `okgn-doc-${d.id}`,
      nodeType: "document",
      refId: d.id,
      title: d.title,
      category: d.category,
      surface: null,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      score: d.isPinned ? 1.2 : 1,
      metadata: { docType: d.docType },
    });
  }
}

function buildNodesFromExecutions(): void {
  const execs = getOpsRunbookExecutions({ limit: 100 });
  for (const e of execs) {
    ensureNode({
      id: `okgn-exec-${e.id}`,
      nodeType: "runbook_execution",
      refId: e.id,
      title: e.documentTitle,
      category: null,
      surface: null,
      status: e.executionStatus,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      score: 1,
      metadata: { linkedType: e.linkedType, linkedId: e.linkedId },
    });
  }
}

function buildPlaceholderNodes(): void {
  const placeholders: Array<[string, OpsKnowledgeGraphNodeType, string]> = [
    ["inc-1", "incident", "추천 Fallback 이슈"],
    ["rd-1", "deployment", "추천 배포 버전"],
    ["rr-1", "report", "일간 추천 보고서"],
    ["oai-1", "action_item", "빈피드 임계치 검토"],
  ];
  const now = new Date().toISOString();
  for (const [refId, nodeType, title] of placeholders) {
    ensureNode({
      id: `okgn-${nodeType}-${refId}`,
      nodeType,
      refId,
      title,
      category: null,
      surface: null,
      status: null,
      createdAt: now,
      updatedAt: now,
      score: 1,
      metadata: {},
    });
  }
}

function init(): void {
  if (NODES.length > 0) return;
  buildNodesFromDocs();
  buildNodesFromExecutions();
  buildPlaceholderNodes();
}

export function getOpsKnowledgeGraphNodes(filters?: {
  nodeType?: OpsKnowledgeGraphNodeType;
  category?: string;
  limit?: number;
}): OpsKnowledgeGraphNode[] {
  init();
  let list = [...NODES];
  if (filters?.nodeType) list = list.filter((n) => n.nodeType === filters.nodeType);
  if (filters?.category) list = list.filter((n) => n.category === filters.category);
  list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const limit = filters?.limit ?? 100;
  return list.slice(0, limit);
}

export function getOpsKnowledgeGraphNodeById(id: string): OpsKnowledgeGraphNode | undefined {
  init();
  return NODES.find((n) => n.id === id);
}

export function getOpsKnowledgeGraphNodeByRef(
  nodeType: OpsKnowledgeGraphNodeType,
  refId: string
): OpsKnowledgeGraphNode | undefined {
  init();
  return NODES.find((n) => n.nodeType === nodeType && n.refId === refId);
}
