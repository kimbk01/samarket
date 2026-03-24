/**
 * 42단계: 유사 문서 추천 mock (category/tag overlap placeholder)
 */

import type { OpsSimilarDocumentRecommendation } from "@/lib/types/ops-knowledge-graph";
import { getOpsDocuments } from "@/lib/ops-docs/mock-ops-documents";

const RECOMMENDATIONS: OpsSimilarDocumentRecommendation[] = [];
let initialized = false;

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

function buildSimilar(): void {
  if (initialized) return;
  initialized = true;
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

export function getOpsSimilarDocumentRecommendations(filters?: {
  sourceDocumentId?: string;
  limit?: number;
}): OpsSimilarDocumentRecommendation[] {
  buildSimilar();
  let list = [...RECOMMENDATIONS];
  if (filters?.sourceDocumentId) {
    list = list.filter((r) => r.sourceDocumentId === filters.sourceDocumentId);
  }
  list.sort((a, b) => b.similarityScore - a.similarityScore);
  const limit = filters?.limit ?? 20;
  return list.slice(0, limit);
}
