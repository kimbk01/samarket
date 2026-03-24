/**
 * 44단계: 운영 성숙도 / 팀 KPI / 개선 로드맵 타입
 */

export type OpsMaturityScope = "weekly" | "monthly";

export interface OpsMaturityScores {
  id: string;
  scoreDate: string;
  scope: OpsMaturityScope;
  overallScore: number;
  monitoringScore: number;
  automationScore: number;
  documentationScore: number;
  responseScore: number;
  recommendationQualityScore: number;
  learningScore: number;
  createdAt: string;
  updatedAt: string;
  note: string;
}

export type OpsKpiPeriodType = "weekly" | "monthly";

export interface OpsTeamKpis {
  id: string;
  periodKey: string;
  periodType: OpsKpiPeriodType;
  incidentAvgResolutionMinutes: number;
  fallbackRate: number;
  rollbackSuccessRate: number;
  documentFreshnessRate: number;
  checklistCompletionRate: number;
  actionCompletionRate: number;
  ctrChangeRate: number;
  conversionRateChange: number;
  createdAt: string;
  updatedAt: string;
}

export type OpsRoadmapSourceType =
  | "learning_pattern"
  | "action_item"
  | "report"
  | "manual";

export type OpsRoadmapDomain =
  | "monitoring"
  | "automation"
  | "documentation"
  | "response"
  | "recommendation_quality"
  | "learning";

export type OpsRoadmapStatus =
  | "planned"
  | "approved"
  | "in_progress"
  | "blocked"
  | "completed"
  | "deferred";

export type OpsRoadmapPriority = "low" | "medium" | "high" | "critical";

export interface OpsImprovementRoadmapItem {
  id: string;
  title: string;
  description: string;
  sourceType: OpsRoadmapSourceType;
  sourceId: string | null;
  domain: OpsRoadmapDomain;
  status: OpsRoadmapStatus;
  priority: OpsRoadmapPriority;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  targetScore: number | null;
  dueDate: string | null;
  milestone: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  note: string;
}

export interface OpsMaturityHistoryEntry {
  id: string;
  scoreDate: string;
  overallScore: number;
  monitoringScore: number;
  automationScore: number;
  documentationScore: number;
  responseScore: number;
  recommendationQualityScore: number;
  learningScore: number;
}

export interface OpsImprovementSummary {
  totalRoadmapItems: number;
  plannedCount: number;
  inProgressCount: number;
  blockedCount: number;
  completedCount: number;
  criticalOpenCount: number;
  averageOverallScore: number;
  latestScoreDate: string | null;
}
