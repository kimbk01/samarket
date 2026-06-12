/**
 * 운영 개선 요약
 */

import type { OpsImprovementSummary } from "@/lib/types/ops-maturity";
import {
  getLatestOpsMaturityScore,
  getOpsImprovementRoadmapItems,
} from "./ops-maturity-state";

export function getOpsImprovementSummary(): OpsImprovementSummary {
  const items = getOpsImprovementRoadmapItems({ limit: 100 });
  const totalRoadmapItems = items.length;
  const plannedCount = items.filter((i) => i.status === "planned").length;
  const inProgressCount = items.filter((i) => i.status === "in_progress").length;
  const blockedCount = items.filter((i) => i.status === "blocked").length;
  const completedCount = items.filter((i) => i.status === "completed").length;
  const criticalOpenCount = items.filter(
    (i) => i.priority === "critical" && !["completed", "deferred"].includes(i.status)
  ).length;

  const latest = getLatestOpsMaturityScore("weekly");
  const averageOverallScore = latest?.overallScore ?? 0;
  const latestScoreDate = latest?.scoreDate ?? null;

  return {
    totalRoadmapItems,
    plannedCount,
    inProgressCount,
    blockedCount,
    completedCount,
    criticalOpenCount,
    averageOverallScore,
    latestScoreDate,
  };
}
