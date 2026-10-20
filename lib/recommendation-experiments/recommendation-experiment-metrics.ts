/**
 * 실험별 성과 집계 (impressions + 배정 기반). 노출 집계 = DB 요약 RPC (서버가 DB 실험 번들의 배정 회원으로 계산 — R7 후속).
 */
import type { ExperimentMetrics } from "@/lib/types/recommendation-experiment";
import { getRecommendationExperimentGroupStats } from "@/lib/recommendation-ops/recommendation-records-summary-state";
import {
  getRecommendationExperimentById,
  getUserFeedAssignments,
} from "@/lib/recommendation-experiments/recommendation-experiments-state";

export function getExperimentMetrics(experimentId: string): ExperimentMetrics[] {
  const experiment = getRecommendationExperimentById(experimentId);
  if (!experiment) return [];

  const assignments = getUserFeedAssignments({ experimentId });
  const byVersion = new Map<string, string[]>();
  for (const a of assignments) {
    if (!byVersion.has(a.assignedVersionId))
      byVersion.set(a.assignedVersionId, []);
    byVersion.get(a.assignedVersionId)!.push(a.userId);
  }

  const allVersionIds = [experiment.controlVersionId, ...experiment.variantVersionIds];
  const now = new Date().toISOString();
  const result: ExperimentMetrics[] = [];

  for (const versionId of allVersionIds) {
    const userIds = new Set(byVersion.get(versionId) ?? []);
    const { impressionCount, clickCount, conversionCount, scoreSum } = getRecommendationExperimentGroupStats(
      experimentId,
      versionId
    );
    const ctr = impressionCount > 0 ? clickCount / impressionCount : 0;
    const conversionRate = clickCount > 0 ? conversionCount / clickCount : 0;
    const avgScore = impressionCount > 0 ? scoreSum / impressionCount : 0;

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
