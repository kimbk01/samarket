/**
 * 37단계: 추천 운영 보고서 / KPI / 섹션·버전·이유·카테고리·지역 분석 / 브리핑 보드 타입
 */

import type { RecommendationSurface } from "@/lib/types/recommendation";

export type ReportType = "daily" | "weekly" | "custom";

export type ReportSurface = "all" | RecommendationSurface;

export type ReportStatus = "ready" | "archived";

export interface RecommendationReport {
  id: string;
  reportType: ReportType;
  surface: ReportSurface;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  generatedBy: string;
  reportStatus: ReportStatus;
  title: string;
  summaryNote: string;
}

export interface RecommendationReportKpis {
  reportId: string;
  impressionCount: number;
  clickCount: number;
  ctr: number;
  conversionCount: number;
  conversionRate: number;
  avgScore: number;
  fallbackCount: number;
  killSwitchCount: number;
  rollbackCount: number;
  incidentCount: number;
}

export type SectionHealthStatus = "healthy" | "warning" | "critical";

export interface RecommendationReportSection {
  id: string;
  reportId: string;
  surface: RecommendationSurface;
  sectionKey: string;
  impressionCount: number;
  clickCount: number;
  ctr: number;
  conversionCount: number;
  conversionRate: number;
  avgScore: number;
  status: SectionHealthStatus;
}

export interface RecommendationReportVersion {
  id: string;
  reportId: string;
  versionId: string;
  surface: RecommendationSurface;
  impressionCount: number;
  clickCount: number;
  ctr: number;
  conversionCount: number;
  conversionRate: number;
  deploymentStatus: string;
  isLiveVersion: boolean;
}

export interface RecommendationReasonAnalytics {
  id: string;
  reportId: string;
  reasonLabel: string;
  impressionCount: number;
  clickCount: number;
  ctr: number;
  conversionCount: number;
  rank: number;
}

export interface RecommendationCategoryAnalytics {
  id: string;
  reportId: string;
  category: string;
  impressionCount: number;
  clickCount: number;
  ctr: number;
  conversionCount: number;
  conversionRate: number;
}

export interface RecommendationRegionAnalytics {
  id: string;
  reportId: string;
  region: string;
  city: string;
  barangay: string | null;
  impressionCount: number;
  clickCount: number;
  ctr: number;
  conversionCount: number;
  conversionRate: number;
}

export interface RecommendationBriefingBoard {
  id: string;
  reportId: string;
  topHighlights: string[];
  topRisks: string[];
  topWinningSections: string[];
  topDroppedSections: string[];
  deploymentSummary: string;
  rollbackSummary: string;
  automationSummary: string;
  createdAt: string;
}
