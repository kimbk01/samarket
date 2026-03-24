/**
 * 44단계: 성숙도 히스토리 mock (차트 placeholder용)
 */

import type { OpsMaturityHistoryEntry } from "@/lib/types/ops-maturity";
import { getOpsMaturityScores } from "./mock-ops-maturity-scores";

export function getOpsMaturityHistory(limit = 12): OpsMaturityHistoryEntry[] {
  const scores = getOpsMaturityScores({ scope: "weekly", limit });
  return scores.map((s) => ({
    id: s.id,
    scoreDate: s.scoreDate,
    overallScore: s.overallScore,
    monitoringScore: s.monitoringScore,
    automationScore: s.automationScore,
    documentationScore: s.documentationScore,
    responseScore: s.responseScore,
    recommendationQualityScore: s.recommendationQualityScore,
    learningScore: s.learningScore,
  }));
}
