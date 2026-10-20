/**
 * 37단계: 보고서 생성 유틸 (일간/주간 집계, KPI·섹션·버전·브리핑 생성)
 */

import type { ReportType, ReportSurface } from "@/lib/types/recommendation-report";
import {
  addRecommendationReport,
  setRecommendationReportKpis,
} from "@/lib/recommendation-analytics/recommendation-analytics-state";
import { getRecommendationAnalyticsSummary } from "@/lib/recommendation/recommendation-analytics-summary";
import { getRecommendationRecordsSummary } from "@/lib/recommendation-ops/recommendation-records-summary-state";

export type ReportPeriod =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days";

function getDateRange(period: ReportPeriod): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date();
  if (period === "today" || period === "yesterday") {
    if (period === "yesterday") {
      to.setDate(to.getDate() - 1);
      from.setDate(from.getDate() - 1);
    }
    return {
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: to.toISOString().slice(0, 10),
    };
  }
  if (period === "last_7_days") {
    from.setDate(from.getDate() - 6);
    return {
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: to.toISOString().slice(0, 10),
    };
  }
  from.setDate(from.getDate() - 29);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

/** 일간/주간 보고서 생성 (노출·실행·이슈 = DB 요약 RPC 집계) */
export function generateRecommendationReport(
  period: ReportPeriod,
  surface: ReportSurface,
  reportType: ReportType,
  generatedBy: string
): string {
  const { dateFrom, dateTo } = getDateRange(period);
  const title =
    reportType === "daily"
      ? `일간 추천 성과 (${dateFrom})`
      : reportType === "weekly"
        ? `주간 추천 성과 (${dateFrom} ~ ${dateTo})`
        : `추천 성과 (${dateFrom} ~ ${dateTo})`;

  const report = addRecommendationReport({
    reportType,
    surface,
    dateFrom,
    dateTo,
    generatedAt: new Date().toISOString(),
    generatedBy,
    reportStatus: "ready",
    title,
    summaryNote: "",
  });

  const summaries = getRecommendationAnalyticsSummary();
  let impressionCount = 0;
  let clickCount = 0;
  let conversionCount = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  for (const s of summaries) {
    if (surface !== "all" && s.surface !== surface) continue;
    impressionCount += s.impressionCount;
    clickCount += s.clickCount;
    conversionCount += s.conversionCount;
    scoreSum += s.avgScore * s.impressionCount;
    scoreCount += s.impressionCount;
  }
  /** 실행·이슈 수 = DB 요약 RPC 전체 건수 (예전: 메모리 보관분 최대 300·200건 — R7 후속). */
  const records = getRecommendationRecordsSummary();
  const fallbackCount = records.executions.byActionType.auto_fallback;
  const killSwitchCount = records.executions.byActionType.auto_kill_switch;
  const rollbackCount = records.executions.byActionType.auto_rollback;
  const incidentCount = records.incidents.total;

  /** 노출 기록이 0건이면 KPI 도 0 (예전: 100000·4000·800 등 예시 숫자로 채움 — 실제가 아닌 값 표시 금지, R7 후속). */
  setRecommendationReportKpis({
    reportId: report.id,
    impressionCount,
    clickCount,
    ctr: impressionCount > 0 ? clickCount / impressionCount : 0,
    conversionCount,
    conversionRate: impressionCount > 0 ? conversionCount / impressionCount : 0,
    avgScore: scoreCount > 0 ? scoreSum / scoreCount : 0,
    fallbackCount,
    killSwitchCount,
    rollbackCount,
    incidentCount,
  });

  return report.id;
}

export { getDateRange };
