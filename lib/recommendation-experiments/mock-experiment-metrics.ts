/**
 * 32단계: 실험별 성과 집계 (31단계 impressions + 배정 기반)
 */

import type { ExperimentMetrics } from "@/lib/types/recommendation-experiment";
import type { RecommendationExperiment } from "@/lib/types/recommendation-experiment";
import { getImpressions } from "@/lib/recommendation/mock-recommendation-impressions";
import { getRecommendationExperimentById } from "./mock-recommendation-experiments";
import { getUserFeedAssignments } from "./mock-user-feed-assignments";

export function getExperimentMetrics(
  experimentId: string
): ExperimentMetrics[] {
  const experiment = getRecommendationExperimentById(experimentId);
  if (!experiment) return [];

  const assignments = getUserFeedAssignments({ experimentId });
  const byVersion = new Map<string, string[]>();
  for (const a of assignments) {
    if (!byVersion.has(a.assignedVersionId))
      byVersion.set(a.assignedVersionId, []);
    byVersion.get(a.assignedVersionId)!.push(a.userId);
  }

  const allVersionIds = [
    experiment.controlVersionId,
    ...experiment.variantVersionIds,
  ];
  const impressions = getImpressions().filter(
    (i) =>
      i.surface === experiment.targetSurface
  );

  const now = new Date().toISOString();
  const result: ExperimentMetrics[] = [];

  for (const versionId of allVersionIds) {
    const userIds = new Set(byVersion.get(versionId) ?? []);
    const versionImpressions = impressions.filter((i) => userIds.has(i.userId));
    const impressionCount = versionImpressions.length;
    const clickCount = versionImpressions.filter((i) => i.clicked).length;
    const conversionCount = versionImpressions.filter((i) => i.converted).length;
    const ctr = impressionCount > 0 ? clickCount / impressionCount : 0;
    const conversionRate = clickCount > 0 ? conversionCount / clickCount : 0;
    const avgScore =
      versionImpressions.length > 0
        ? versionImpressions.reduce((s, i) => s + i.score, 0) /
          versionImpressions.length
        : 0;

    result.push({
      id: `em-${experimentId}-${versionId}`,
      experimentId,
      versionId,
      assignedUsers: userIds.size,
      impressionCount,
      clickCount,
      conversionCount,
      ctr,
      conversionRate,
      avgScore: Math.round(avgScore * 100) / 100,
      updatedAt: now,
    });
  }

  return result;
}
