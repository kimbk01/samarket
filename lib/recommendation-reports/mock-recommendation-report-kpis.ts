/**
 * 37단계: 보고서 KPI 요약 mock
 */

import type { RecommendationReportKpis } from "@/lib/types/recommendation-report";

const KPIS_BY_REPORT: Map<string, RecommendationReportKpis> = new Map([
  [
    "rr-1",
    {
      reportId: "rr-1",
      impressionCount: 125000,
      clickCount: 5120,
      ctr: 0.04096,
      conversionCount: 980,
      conversionRate: 0.00784,
      avgScore: 0.72,
      fallbackCount: 0,
      killSwitchCount: 0,
      rollbackCount: 0,
      incidentCount: 0,
    },
  ],
  [
    "rr-2",
    {
      reportId: "rr-2",
      impressionCount: 890000,
      clickCount: 35600,
      ctr: 0.04,
      conversionCount: 6230,
      conversionRate: 0.007,
      avgScore: 0.71,
      fallbackCount: 1,
      killSwitchCount: 0,
      rollbackCount: 0,
      incidentCount: 2,
    },
  ],
]);

export function getRecommendationReportKpis(
  reportId: string
): RecommendationReportKpis | undefined {
  return KPIS_BY_REPORT.get(reportId);
}

export function setRecommendationReportKpis(
  kpis: RecommendationReportKpis
): void {
  KPIS_BY_REPORT.set(kpis.reportId, kpis);
}
