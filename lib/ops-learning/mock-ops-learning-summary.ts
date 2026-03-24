/**
 * 43단계: 운영 학습 요약 mock
 */

import type { OpsLearningSummary } from "@/lib/types/ops-learning";
import { getOpsIssuePatterns } from "./mock-ops-issue-patterns";
import { getOpsResponseQualityFeedback } from "./mock-ops-response-quality-feedback";

export function getOpsLearningSummary(): OpsLearningSummary {
  const patterns = getOpsIssuePatterns({ limit: 100 });
  const feedback = getOpsResponseQualityFeedback({ limit: 100 });

  const totalPatterns = patterns.length;
  const openPatterns = patterns.filter(
    (p) => !["mitigated", "closed"].includes(p.status)
  ).length;
  const mitigatedPatterns = patterns.filter((p) => p.status === "mitigated").length;
  const highRecurrencePatterns = patterns.filter(
    (p) => (p.recurrenceRate ?? 0) >= 0.3
  ).length;

  const avgResponseQualityScore =
    feedback.length > 0
      ? feedback.reduce((s, f) => s + f.responseQualityScore, 0) / feedback.length
      : 0;
  const avgResolutionSpeedScore =
    feedback.length > 0
      ? feedback.reduce((s, f) => s + f.resolutionSpeedScore, 0) / feedback.length
      : 0;

  const sorted = [...patterns].sort(
    (a, b) => new Date(b.lastOccurredAt).getTime() - new Date(a.lastOccurredAt).getTime()
  );
  const latestDetectedAt = sorted[0]?.lastOccurredAt ?? null;

  return {
    totalPatterns,
    openPatterns,
    mitigatedPatterns,
    avgResponseQualityScore: Math.round(avgResponseQualityScore * 100) / 100,
    avgResolutionSpeedScore: Math.round(avgResolutionSpeedScore * 100) / 100,
    highRecurrencePatterns,
    latestDetectedAt,
  };
}
