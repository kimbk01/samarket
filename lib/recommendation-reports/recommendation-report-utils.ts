/**
 * 37단계: 보고서 생성 유틸 (일간/주간 집계, KPI·섹션·버전·브리핑 생성)
 */

import type { ReportType, ReportSurface } from "@/lib/types/recommendation-report";
import { addRecommendationReport } from "./mock-recommendation-reports";
import { setRecommendationReportKpis } from "./mock-recommendation-report-kpis";
import { getRecommendationAnalyticsSummary } from "@/lib/recommendation/mock-recommendation-analytics-summary";
import { getRecommendationAutomationExecutions } from "@/lib/recommendation-automation/mock-recommendation-automation-executions";
import { getRecommendationIncidents } from "@/lib/recommendation-monitoring/mock-recommendation-incidents";
import { getRecommendationDeployments } from "@/lib/recommendation-deployments/mock-recommendation-deployments";

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

/** 일간/주간 보고서 생성 (mock: analytics + automation + incidents 기반 집계) */
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
  const executions = getRecommendationAutomationExecutions({ limit: 500 });
  const fallbackCount = executions.filter((e) => e.actionType === "auto_fallback").length;
  const killSwitchCount = executions.filter((e) => e.actionType === "auto_kill_switch").length;
  const rollbackCount = executions.filter((e) => e.actionType === "auto_rollback").length;
  const incidents = getRecommendationIncidents();
  const incidentCount = incidents.length;
  const deployments = getRecommendationDeployments();

  setRecommendationReportKpis({
    reportId: report.id,
    impressionCount: impressionCount || 100000,
    clickCount: clickCount || 4000,
    ctr: impressionCount > 0 ? clickCount / impressionCount : 0.04,
    conversionCount: conversionCount || 800,
    conversionRate: impressionCount > 0 ? conversionCount / impressionCount : 0.008,
    avgScore: scoreCount > 0 ? scoreSum / scoreCount : 0.72,
    fallbackCount,
    killSwitchCount,
    rollbackCount,
    incidentCount,
  });

  return report.id;
}

export { getDateRange };
