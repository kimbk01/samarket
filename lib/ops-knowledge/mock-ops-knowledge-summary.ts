/**
 * 41단계: 지식베이스 요약 mock
 */

import type { OpsKnowledgeSummary } from "@/lib/types/ops-knowledge";
import { getOpsKnowledgeBaseIndex } from "./mock-ops-knowledge-base-index";
import { getOpsKnowledgeSearchLogs } from "./mock-ops-knowledge-search-logs";
import { getOpsKnowledgeRecommendationLogs } from "./mock-ops-knowledge-recommendation-logs";

const TODAY = new Date().toISOString().slice(0, 10);

export function getOpsKnowledgeSummary(): OpsKnowledgeSummary {
  const index = getOpsKnowledgeBaseIndex({ limit: 1000 });
  const totalDocuments = index.length;
  const activeDocuments = index.filter((i) => i.status === "active").length;
  const searchLogs = getOpsKnowledgeSearchLogs({ limit: 1000 });
  const totalSearchesToday = searchLogs.filter(
    (l) => l.createdAt.slice(0, 10) === TODAY
  ).length;
  const recLogs = getOpsKnowledgeRecommendationLogs({ limit: 1000 });
  const totalRecommendationClicks = recLogs.filter((l) => l.clicked).length;
  const sorted = [...index].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const latestUpdatedAt = sorted[0]?.updatedAt ?? null;
  const categories = index.map((i) => i.category);
  const counts: Record<string, number> = {};
  categories.forEach((c) => { counts[c] = (counts[c] ?? 0) + 1; });
  const topCategory =
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topSearchedKeyword = searchLogs[0]?.query ?? null;

  return {
    totalDocuments,
    activeDocuments,
    totalSearchesToday,
    totalRecommendationClicks,
    latestUpdatedAt,
    topCategory,
    topSearchedKeyword,
  };
}
