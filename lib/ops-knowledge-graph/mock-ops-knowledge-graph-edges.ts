/**
 * 42단계: 지식 그래프 엣지 mock
 */

import type { OpsKnowledgeGraphEdge, OpsKnowledgeGraphEdgeType } from "@/lib/types/ops-knowledge-graph";
import { getOpsKnowledgeGraphNodeByRef } from "./mock-ops-knowledge-graph-nodes";
import { getOpsRunbookExecutions } from "@/lib/ops-runbooks/mock-ops-runbook-executions";

const EDGES: OpsKnowledgeGraphEdge[] = [];
let initialized = false;

function ensureEdge(edge: OpsKnowledgeGraphEdge): void {
  if (!EDGES.find((e) => e.id === edge.id)) EDGES.push(edge);
}

function buildEdges(): void {
  if (initialized) return;
  initialized = true;
  const execs = getOpsRunbookExecutions({ limit: 50 });
  const now = new Date().toISOString();

  for (const e of execs) {
    const docNode = getOpsKnowledgeGraphNodeByRef("document", e.documentId);
    const execNode = getOpsKnowledgeGraphNodeByRef("runbook_execution", e.id);
    if (docNode && execNode) {
      ensureEdge({
        id: `okge-exec-${e.id}`,
        sourceNodeId: execNode.id,
        targetNodeId: docNode.id,
        edgeType: "executed_by",
        weight: 1,
        createdAt: now,
        note: "",
      });
    }
    if (e.linkedId) {
      const refType = e.linkedType === "incident" ? "incident" : e.linkedType === "deployment" ? "deployment" : null;
      if (refType) {
        const refNode = getOpsKnowledgeGraphNodeByRef(refType as "incident" | "deployment", e.linkedId);
        if (refNode && execNode) {
          ensureEdge({
            id: `okge-link-${e.id}-${e.linkedId}`,
            sourceNodeId: refNode.id,
            targetNodeId: execNode.id,
            edgeType: "related_to",
            weight: 1,
            createdAt: now,
            note: e.linkedType,
          });
        }
      }
    }
  }

  const docOd1 = getOpsKnowledgeGraphNodeByRef("document", "od-1");
  const docOd3 = getOpsKnowledgeGraphNodeByRef("document", "od-3");
  const inc1 = getOpsKnowledgeGraphNodeByRef("incident", "inc-1");
  if (docOd1 && inc1) {
    ensureEdge({
      id: "okge-rec-inc-1-od-1",
      sourceNodeId: inc1.id,
      targetNodeId: docOd1.id,
      edgeType: "recommended_for",
      weight: 0.95,
      createdAt: now,
      note: "fallback",
    });
  }
  if (docOd3) {
    const rd1 = getOpsKnowledgeGraphNodeByRef("deployment", "rd-1");
    if (rd1) {
      ensureEdge({
        id: "okge-rollback-rd-od3",
        sourceNodeId: rd1.id,
        targetNodeId: docOd3.id,
        edgeType: "resolved_with",
        weight: 1,
        createdAt: now,
        note: "rollback",
      });
    }
  }
}

export function getOpsKnowledgeGraphEdges(filters?: {
  edgeType?: OpsKnowledgeGraphEdgeType;
  sourceNodeId?: string;
  targetNodeId?: string;
  limit?: number;
}): OpsKnowledgeGraphEdge[] {
  buildEdges();
  let list = [...EDGES];
  if (filters?.edgeType) list = list.filter((e) => e.edgeType === filters.edgeType);
  if (filters?.sourceNodeId) list = list.filter((e) => e.sourceNodeId === filters.sourceNodeId);
  if (filters?.targetNodeId) list = list.filter((e) => e.targetNodeId === filters.targetNodeId);
  const limit = filters?.limit ?? 100;
  return list.slice(0, limit);
}

export function getOpsKnowledgeGraphEdgeById(id: string): OpsKnowledgeGraphEdge | undefined {
  buildEdges();
  return EDGES.find((e) => e.id === id);
}
