/**
 * 운영 지식 그래프 — 노드·엣지·해결 사례·문서 랭킹·유사 추천 단일 저장소.
 * 영속화: `ops-knowledge-graph-db` + `/api/admin/ops-knowledge-graph`
 */
import type {
  OpsKnowledgeDocumentRanking,
  OpsKnowledgeGraphEdge,
  OpsKnowledgeGraphEdgeType,
  OpsKnowledgeGraphNode,
  OpsKnowledgeGraphNodeType,
  OpsResolutionCase,
  OpsResolutionOutcomeType,
  OpsSimilarDocumentRecommendation,
} from "@/lib/types/ops-knowledge-graph";
import { getOpsDocuments } from "@/lib/ops-docs/ops-docs-state";
import {
  getOpsRunbookExecutions,
  getOpsRunbookResults,
} from "@/lib/ops-runbooks/ops-runbooks-state";

const NODES: OpsKnowledgeGraphNode[] = [];
const EDGES: OpsKnowledgeGraphEdge[] = [];
const CASES: OpsResolutionCase[] = [];
const RANKINGS: OpsKnowledgeDocumentRanking[] = [];
const RECOMMENDATIONS: OpsSimilarDocumentRecommendation[] = [];
let initialized = false;

export type OpsKnowledgeGraphBundleV1 = {
  version: 1;
  nodes: OpsKnowledgeGraphNode[];
  edges: OpsKnowledgeGraphEdge[];
  resolutionCases: OpsResolutionCase[];
  documentRankings: OpsKnowledgeDocumentRanking[];
  similarRecommendations: OpsSimilarDocumentRecommendation[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

function clearGraph(): void {
  NODES.length = 0;
  EDGES.length = 0;
  CASES.length = 0;
  RANKINGS.length = 0;
  RECOMMENDATIONS.length = 0;
  initialized = false;
}

function ensureNode(node: OpsKnowledgeGraphNode): void {
  if (!NODES.find((n) => n.id === node.id)) NODES.push(node);
}

function findNodeByRef(
  nodeType: OpsKnowledgeGraphNodeType,
  refId: string
): OpsKnowledgeGraphNode | undefined {
  return NODES.find((n) => n.nodeType === nodeType && n.refId === refId);
}

function ensureEdge(edge: OpsKnowledgeGraphEdge): void {
  if (!EDGES.find((e) => e.id === edge.id)) EDGES.push(edge);
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

function buildEdgesFromRunbooks(): void {
  const execs = getOpsRunbookExecutions({ limit: 50 });
  const now = new Date().toISOString();

  for (const e of execs) {
    const docNode = findNodeByRef("document", e.documentId);
    const execNode = findNodeByRef("runbook_execution", e.id);
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
      const refType =
        e.linkedType === "incident"
          ? "incident"
          : e.linkedType === "deployment"
            ? "deployment"
            : null;
      if (refType) {
        const refNode = findNodeByRef(refType, e.linkedId);
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

  const docOd1 = findNodeByRef("document", "od-1");
  const docOd3 = findNodeByRef("document", "od-3");
  const inc1 = findNodeByRef("incident", "inc-1");
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
    const rd1 = findNodeByRef("deployment", "rd-1");
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

function buildResolutionCases(): void {
  const execs = getOpsRunbookExecutions({ status: "completed", limit: 20 });

  for (const e of execs) {
    const results = getOpsRunbookResults(e.id);
    const outcome = (results[0]?.outcomeType ?? "resolved") as OpsResolutionOutcomeType;
    CASES.push({
      id: `okrc-${e.id}`,
      incidentId: e.linkedId ?? e.linkedType,
      primaryDocumentId: e.documentId,
      relatedRunbookExecutionId: e.id,
      outcomeType: outcome,
      effectivenessScore: 0.85,
      createdAt: e.completedAt ?? e.updatedAt,
      note: results[0]?.summary ?? e.resultNote ?? "",
    });
  }

  CASES.push({
    id: "okrc-inc-1",
    incidentId: "inc-1",
    primaryDocumentId: "od-1",
    relatedRunbookExecutionId: null,
    outcomeType: "resolved",
    effectivenessScore: 0.9,
    createdAt: new Date().toISOString(),
    note: "Fallback 대응 플레이북 적용",
  });

  CASES.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function buildDocumentRankings(): void {
  const docs = getOpsDocuments({ limit: 50 });
  const execs = getOpsRunbookExecutions({ limit: 100 });
  const now = new Date().toISOString();

  const execCountByDoc: Record<string, number> = {};
  const resolvedWithByDoc: Record<string, number> = {};
  for (const e of execs) {
    execCountByDoc[e.documentId] = (execCountByDoc[e.documentId] ?? 0) + 1;
  }
  for (const edge of EDGES) {
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

function overlapScore(
  a: { category: string; tags: string[] },
  b: { category: string; tags: string[] }
): number {
  let s = 0;
  if (a.category === b.category) s += 0.5;
  const setB = new Set(b.tags);
  const common = a.tags.filter((t) => setB.has(t)).length;
  s += (common / Math.max(a.tags.length, b.tags.length, 1)) * 0.5;
  return Math.min(1, s);
}

function buildSimilarRecommendations(): void {
  const docs = getOpsDocuments({ status: "active", limit: 20 });
  const now = new Date().toISOString();

  for (let i = 0; i < docs.length; i++) {
    for (let j = 0; j < docs.length; j++) {
      if (i === j) continue;
      const a = docs[i];
      const b = docs[j];
      const score = overlapScore(
        { category: a.category, tags: a.tags },
        { category: b.category, tags: b.tags }
      );
      if (score < 0.2) continue;
      const reasons: string[] = [];
      if (a.category === b.category) reasons.push("동일 카테고리");
      const commonTags = a.tags.filter((t) => b.tags.includes(t));
      if (commonTags.length) reasons.push(`태그: ${commonTags.join(", ")}`);

      RECOMMENDATIONS.push({
        id: `oksd-${a.id}-${b.id}`,
        sourceDocumentId: a.id,
        targetDocumentId: b.id,
        similarityScore: score,
        reasonLabels: reasons.length ? reasons : ["관련 문서"],
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

export function rebuildOpsKnowledgeGraph(): void {
  clearGraph();
  buildNodesFromDocs();
  buildNodesFromExecutions();
  buildPlaceholderNodes();
  buildEdgesFromRunbooks();
  buildResolutionCases();
  buildDocumentRankings();
  buildSimilarRecommendations();
  initialized = true;
}

function ensureGraph(): void {
  if (!initialized || NODES.length === 0) {
    rebuildOpsKnowledgeGraph();
  }
}

export function createDefaultOpsKnowledgeGraphBundle(): OpsKnowledgeGraphBundleV1 {
  rebuildOpsKnowledgeGraph();
  return exportOpsKnowledgeGraphBundle();
}

export function importOpsKnowledgeGraphBundle(bundle: OpsKnowledgeGraphBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(NODES, (bundle.nodes ?? []).map((n) => ({ ...n })));
  replaceArray(EDGES, (bundle.edges ?? []).map((e) => ({ ...e })));
  replaceArray(CASES, (bundle.resolutionCases ?? []).map((c) => ({ ...c })));
  replaceArray(RANKINGS, (bundle.documentRankings ?? []).map((r) => ({ ...r })));
  replaceArray(
    RECOMMENDATIONS,
    (bundle.similarRecommendations ?? []).map((r) => ({ ...r }))
  );
  initialized = true;
  if (!NODES.length) rebuildOpsKnowledgeGraph();
}

export function exportOpsKnowledgeGraphBundle(): OpsKnowledgeGraphBundleV1 {
  if (!initialized || NODES.length === 0) {
    rebuildOpsKnowledgeGraph();
  }
  return {
    version: 1,
    nodes: NODES.map((n) => ({ ...n })),
    edges: EDGES.map((e) => ({ ...e })),
    resolutionCases: CASES.map((c) => ({ ...c })),
    documentRankings: RANKINGS.map((r) => ({ ...r })),
    similarRecommendations: RECOMMENDATIONS.map((r) => ({ ...r })),
  };
}

/* ─── nodes ─────────────────────────────────────────────────── */

export function getOpsKnowledgeGraphNodes(filters?: {
  nodeType?: OpsKnowledgeGraphNodeType;
  category?: string;
  limit?: number;
}): OpsKnowledgeGraphNode[] {
  ensureGraph();
  let list = [...NODES];
  if (filters?.nodeType) list = list.filter((n) => n.nodeType === filters.nodeType);
  if (filters?.category) list = list.filter((n) => n.category === filters.category);
  list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const limit = filters?.limit ?? 100;
  return list.slice(0, limit);
}

export function getOpsKnowledgeGraphNodeById(
  id: string
): OpsKnowledgeGraphNode | undefined {
  ensureGraph();
  return NODES.find((n) => n.id === id);
}

export function getOpsKnowledgeGraphNodeByRef(
  nodeType: OpsKnowledgeGraphNodeType,
  refId: string
): OpsKnowledgeGraphNode | undefined {
  ensureGraph();
  return findNodeByRef(nodeType, refId);
}

/* ─── edges ─────────────────────────────────────────────────── */

export function getOpsKnowledgeGraphEdges(filters?: {
  edgeType?: OpsKnowledgeGraphEdgeType;
  sourceNodeId?: string;
  targetNodeId?: string;
  limit?: number;
}): OpsKnowledgeGraphEdge[] {
  ensureGraph();
  let list = [...EDGES];
  if (filters?.edgeType) list = list.filter((e) => e.edgeType === filters.edgeType);
  if (filters?.sourceNodeId) list = list.filter((e) => e.sourceNodeId === filters.sourceNodeId);
  if (filters?.targetNodeId) list = list.filter((e) => e.targetNodeId === filters.targetNodeId);
  const limit = filters?.limit ?? 100;
  return list.slice(0, limit);
}

export function getOpsKnowledgeGraphEdgeById(
  id: string
): OpsKnowledgeGraphEdge | undefined {
  ensureGraph();
  return EDGES.find((e) => e.id === id);
}

/* ─── resolution cases ──────────────────────────────────────── */

export function getOpsResolutionCases(filters?: {
  incidentId?: string;
  documentId?: string;
  limit?: number;
}): OpsResolutionCase[] {
  ensureGraph();
  let list = [...CASES];
  if (filters?.incidentId) list = list.filter((c) => c.incidentId === filters.incidentId);
  if (filters?.documentId) list = list.filter((c) => c.primaryDocumentId === filters.documentId);
  const limit = filters?.limit ?? 30;
  return list.slice(0, limit);
}

/* ─── document rankings ─────────────────────────────────────── */

export function getOpsKnowledgeDocumentRankings(filters?: {
  limit?: number;
}): OpsKnowledgeDocumentRanking[] {
  ensureGraph();
  const limit = filters?.limit ?? 50;
  return RANKINGS.slice(0, limit);
}

export function getOpsKnowledgeDocumentRankingByDocumentId(
  documentId: string
): OpsKnowledgeDocumentRanking | undefined {
  ensureGraph();
  return RANKINGS.find((r) => r.documentId === documentId);
}

/* ─── similar document recommendations ──────────────────────── */

export function getOpsSimilarDocumentRecommendations(filters?: {
  sourceDocumentId?: string;
  limit?: number;
}): OpsSimilarDocumentRecommendation[] {
  ensureGraph();
  let list = [...RECOMMENDATIONS];
  if (filters?.sourceDocumentId) {
    list = list.filter((r) => r.sourceDocumentId === filters.sourceDocumentId);
  }
  list.sort((a, b) => b.similarityScore - a.similarityScore);
  const limit = filters?.limit ?? 20;
  return list.slice(0, limit);
}
