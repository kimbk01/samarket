/**
 * 33단계: 실험 승자 요약 (종료 실험 → 승자 버전 선택 결과)
 */

import type {
  ExperimentWinnerSummary,
  WinningMetric,
  WinningGroup,
} from "@/lib/types/recommendation-deployment";
import { getExperimentMetrics } from "@/lib/recommendation-experiments/mock-experiment-metrics";
import { getRecommendationExperimentById } from "@/lib/recommendation-experiments/mock-recommendation-experiments";

const SUMMARIES: ExperimentWinnerSummary[] = [];

export function getExperimentWinnerSummaries(experimentId?: string): ExperimentWinnerSummary[] {
  let list = [...SUMMARIES];
  if (experimentId) list = list.filter((s) => s.experimentId === experimentId);
  return list.sort(
    (a, b) => new Date(b.comparedAt).getTime() - new Date(a.comparedAt).getTime()
  );
}

export function getExperimentWinnerSummary(
  experimentId: string
): ExperimentWinnerSummary | undefined {
  return SUMMARIES.find((s) => s.experimentId === experimentId);
}

function groupFromVersionId(
  exp: { controlVersionId: string; variantVersionIds: string[] },
  versionId: string
): WinningGroup {
  if (versionId === exp.controlVersionId) return "control";
  if (exp.variantVersionIds[0] === versionId) return "variant_a";
  return "variant_b";
}

export function chooseWinner(
  experimentId: string,
  winningMetric: WinningMetric,
  adminId = "admin1",
  adminNickname = "관리자"
): ExperimentWinnerSummary | null {
  const experiment = getRecommendationExperimentById(experimentId);
  if (!experiment || experiment.status !== "ended") return null;

  const metrics = getExperimentMetrics(experimentId);
  if (metrics.length === 0) return null;

  let best = metrics[0]!;
  let value = 0;
  for (const m of metrics) {
    const v =
      winningMetric === "ctr"
        ? m.ctr
        : winningMetric === "conversion_rate"
          ? m.conversionRate
          : m.ctr * 0.4 + m.conversionRate * 0.6;
    if (v > value) {
      value = v;
      best = m;
    }
  }
  if (winningMetric === "composite_score" && best) {
    value = best.ctr * 0.4 + best.conversionRate * 0.6;
  } else if (best) {
    value = winningMetric === "ctr" ? best.ctr : best.conversionRate;
  }

  const existingIdx = SUMMARIES.findIndex((s) => s.experimentId === experimentId);
  if (existingIdx >= 0) SUMMARIES.splice(existingIdx, 1);

  const summary: ExperimentWinnerSummary = {
    experimentId,
    winningVersionId: best.versionId,
    winningGroup: groupFromVersionId(experiment, best.versionId),
    winningMetric,
    winningValue: Math.round(value * 10000) / 10000,
    comparedAt: new Date().toISOString(),
    autoDeployRecommended: value > 0.1,
  };
  SUMMARIES.unshift(summary);
  return summary;
}
