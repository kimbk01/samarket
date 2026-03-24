/**
 * 44단계: 운영 성숙도 점수 mock
 */

import type { OpsMaturityScores, OpsMaturityScope } from "@/lib/types/ops-maturity";

const SCORES: OpsMaturityScores[] = [
  {
    id: "oms-1",
    scoreDate: new Date().toISOString().slice(0, 10),
    scope: "weekly",
    overallScore: 72,
    monitoringScore: 78,
    automationScore: 65,
    documentationScore: 80,
    responseScore: 70,
    recommendationQualityScore: 75,
    learningScore: 68,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    note: "",
  },
  {
    id: "oms-2",
    scoreDate: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    scope: "weekly",
    overallScore: 70,
    monitoringScore: 75,
    automationScore: 62,
    documentationScore: 78,
    responseScore: 68,
    recommendationQualityScore: 73,
    learningScore: 65,
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    note: "",
  },
  {
    id: "oms-3",
    scoreDate: new Date().toISOString().slice(0, 7) + "-01",
    scope: "monthly",
    overallScore: 71,
    monitoringScore: 76,
    automationScore: 64,
    documentationScore: 79,
    responseScore: 69,
    recommendationQualityScore: 74,
    learningScore: 66,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    note: "",
  },
];

export function getOpsMaturityScores(filters?: {
  scope?: OpsMaturityScope;
  limit?: number;
}): OpsMaturityScores[] {
  let list = [...SCORES].sort(
    (a, b) => new Date(b.scoreDate).getTime() - new Date(a.scoreDate).getTime()
  );
  if (filters?.scope) list = list.filter((s) => s.scope === filters.scope);
  const limit = filters?.limit ?? 20;
  return list.slice(0, limit);
}

export function getOpsMaturityScoreByDate(
  scoreDate: string,
  scope: OpsMaturityScope
): OpsMaturityScores | undefined {
  return SCORES.find((s) => s.scoreDate === scoreDate && s.scope === scope);
}

export function getLatestOpsMaturityScore(
  scope: OpsMaturityScope
): OpsMaturityScores | undefined {
  const list = SCORES.filter((s) => s.scope === scope).sort(
    (a, b) => new Date(b.scoreDate).getTime() - new Date(a.scoreDate).getTime()
  );
  return list[0];
}

/** periodKey: YYYY-MM-DD (주) 또는 YYYY-MM (달) */
export function getOpsMaturityScoreByPeriodKey(
  periodKey: string,
  scope: OpsMaturityScope
): OpsMaturityScores | undefined {
  return SCORES.find(
    (s) => s.scope === scope && (s.scoreDate === periodKey || s.scoreDate.startsWith(periodKey))
  );
}
