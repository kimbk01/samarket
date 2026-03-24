/**
 * 41단계: 지식베이스 검색 인덱스 (39단계 opsDocuments 기반)
 */

import type {
  OpsKnowledgeBaseIndexItem,
  OpsKnowledgeCategory,
  OpsKnowledgeDocStatus,
  OpsKnowledgeDocType,
} from "@/lib/types/ops-knowledge";
import { getOpsDocuments } from "@/lib/ops-docs/mock-ops-documents";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s가-힣]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function buildIndexFromDocs(): OpsKnowledgeBaseIndexItem[] {
  const docs = getOpsDocuments({ limit: 500 });
  return docs.map((d) => {
    const tokens = [
      ...tokenize(d.title),
      ...tokenize(d.summary),
      ...d.tags.map((t) => t.toLowerCase()),
    ];
    const keywordTokens = [...new Set(tokens)];
    const linkedTypes = d.category === "incident_response" ? ["incident", "fallback", "kill_switch"] : [];
    if (d.category === "rollback" || d.tags.includes("rollback")) linkedTypes.push("rollback");
    if (d.category === "deployment" || d.tags.includes("deployment")) linkedTypes.push("deployment");
    return {
      id: `okbi-${d.id}`,
      documentId: d.id,
      docType: d.docType as OpsKnowledgeDocType,
      title: d.title,
      slug: d.slug,
      category: d.category,
      status: d.status as OpsKnowledgeDocStatus,
      summary: d.summary,
      tags: d.tags,
      keywordTokens,
      linkedTypes: linkedTypes.length ? linkedTypes : ["manual_search"],
      updatedAt: d.updatedAt,
      popularityScore: d.isPinned ? 1.5 : 1,
      isPinned: d.isPinned,
    };
  });
}

let CACHE: OpsKnowledgeBaseIndexItem[] | null = null;

function getIndex(): OpsKnowledgeBaseIndexItem[] {
  if (!CACHE) CACHE = buildIndexFromDocs();
  return CACHE;
}

export function getOpsKnowledgeBaseIndex(filters?: {
  query?: string;
  docType?: OpsKnowledgeDocType;
  status?: OpsKnowledgeDocStatus;
  category?: OpsKnowledgeCategory;
  includeExecutionHistory?: boolean;
  limit?: number;
}): OpsKnowledgeBaseIndexItem[] {
  let list = [...getIndex()];
  if (filters?.status) list = list.filter((i) => i.status === filters.status);
  else list = list.filter((i) => i.status === "active");
  if (filters?.docType) list = list.filter((i) => i.docType === filters.docType);
  if (filters?.category) list = list.filter((i) => i.category === filters.category);
  if (filters?.query) {
    const q = filters.query.toLowerCase().trim();
    const terms = q.split(/\s+/).filter(Boolean);
    list = list.filter((item) => {
      const searchable = [
        item.title,
        item.summary,
        ...item.tags,
        ...item.keywordTokens,
      ].join(" ").toLowerCase();
      return terms.every((t) => searchable.includes(t));
    });
  }
  list.sort((a, b) => {
    const pin = (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
    if (pin !== 0) return pin;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  const limit = filters?.limit ?? 50;
  return list.slice(0, limit);
}

export function getOpsKnowledgeBaseIndexItemByDocumentId(
  documentId: string
): OpsKnowledgeBaseIndexItem | undefined {
  return getIndex().find((i) => i.documentId === documentId);
}

export function invalidateOpsKnowledgeIndexCache(): void {
  CACHE = null;
}
