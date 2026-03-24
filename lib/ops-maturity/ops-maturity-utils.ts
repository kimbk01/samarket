/**
 * 44단계: 성숙도 점수·기간 비교 유틸
 */

import { getLatestOpsMaturityScore, getOpsMaturityScoreByPeriodKey } from "./mock-ops-maturity-scores";
import { getOpsTeamKpiByPeriod } from "./mock-ops-team-kpis";
import type { OpsMaturityScope } from "@/lib/types/ops-maturity";
import type { OpsKpiPeriodType } from "@/lib/types/ops-maturity";

/** 이번 주/지난 주, 이번 달/지난 달 키 */
export function getPeriodKeys(scope: "weekly" | "monthly"): { current: string; previous: string } {
  const now = new Date();
  if (scope === "weekly") {
    const sun = new Date(now);
    sun.setDate(now.getDate() - now.getDay());
    const prevSun = new Date(sun);
    prevSun.setDate(prevSun.getDate() - 7);
    return {
      current: sun.toISOString().slice(0, 10),
      previous: prevSun.toISOString().slice(0, 10),
    };
  }
  const thisMonth = now.toISOString().slice(0, 7);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  return { current: thisMonth, previous: lastMonth };
}

/** 현재 vs 이전 기간 성숙도 점수 비교 (증감) */
export function getMaturityScoreComparison(
  scope: OpsMaturityScope
): { current: number; previous: number; delta: number } {
  const { current, previous } = getPeriodKeys(scope);
  const currScore = getOpsMaturityScoreByPeriodKey(current, scope) ?? getLatestOpsMaturityScore(scope);
  const prevScore = getOpsMaturityScoreByPeriodKey(previous, scope);
  const currentVal = currScore?.overallScore ?? 0;
  const previousVal = prevScore?.overallScore ?? 0;
  return {
    current: currentVal,
    previous: previousVal,
    delta: currentVal - previousVal,
  };
}

/** KPI 기간 비교 */
export function getKpiComparison(
  periodType: OpsKpiPeriodType
): { current: ReturnType<typeof getOpsTeamKpiByPeriod>; previous: ReturnType<typeof getOpsTeamKpiByPeriod> } {
  const { current, previous } = getPeriodKeys(periodType);
  return {
    current: getOpsTeamKpiByPeriod(current, periodType),
    previous: getOpsTeamKpiByPeriod(previous, periodType),
  };
}
