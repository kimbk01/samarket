/**
 * 37단계: 추천 운영 보고서 mock
 */

import type {
  RecommendationReport,
  ReportType,
  ReportSurface,
} from "@/lib/types/recommendation-report";

const REPORTS: RecommendationReport[] = [
  {
    id: "rr-1",
    reportType: "daily",
    surface: "all",
    dateFrom: new Date().toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    generatedBy: "admin1",
    reportStatus: "ready",
    title: "일간 추천 성과 리포트",
    summaryNote: "전체 surface 일간 집계",
  },
  {
    id: "rr-2",
    reportType: "weekly",
    surface: "all",
    dateFrom: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10),
    generatedAt: new Date(Date.now() - 86400000).toISOString(),
    generatedBy: "admin1",
    reportStatus: "ready",
    title: "주간 추천 성과 리포트",
    summaryNote: "전체 surface 주간 집계",
  },
];

export function getRecommendationReports(filters?: {
  reportType?: ReportType;
  surface?: ReportSurface;
  limit?: number;
}): RecommendationReport[] {
  let list = [...REPORTS].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  );
  if (filters?.reportType) list = list.filter((r) => r.reportType === filters.reportType);
  if (filters?.surface) list = list.filter((r) => r.surface === filters.surface);
  const limit = filters?.limit ?? 50;
  return list.slice(0, limit);
}

export function getRecommendationReportById(
  id: string
): RecommendationReport | undefined {
  return REPORTS.find((r) => r.id === id);
}

export function addRecommendationReport(
  input: Omit<RecommendationReport, "id">
): RecommendationReport {
  const report: RecommendationReport = {
    ...input,
    id: `rr-${Date.now()}`,
  };
  REPORTS.unshift(report);
  return { ...report };
}
