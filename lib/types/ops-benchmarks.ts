/**
 * 45단계: 운영 벤치마크 / 분기별 개선 계획 / 관리자 성과 리뷰 타입
 */

export type OpsBenchmarkScope = "quarterly" | "yearly";

export type OpsBenchmarkDomain =
  | "recommendation_quality"
  | "incident_response"
  | "automation"
  | "documentation"
  | "execution"
  | "learning";

export type OpsBenchmarkTrend = "improving" | "stable" | "declining";

export interface OpsBenchmark {
  id: string;
  benchmarkDate: string;
  scope: OpsBenchmarkScope;
  domain: OpsBenchmarkDomain;
  currentScore: number;
  targetScore: number;
  referenceScore: number;
  gapScore: number;
  trend: OpsBenchmarkTrend;
  createdAt: string;
  updatedAt: string;
  note: string;
}

export type OpsQuarter = "Q1" | "Q2" | "Q3" | "Q4";

export type OpsQuarterlyPlanStatus =
  | "planned"
  | "approved"
  | "in_progress"
  | "at_risk"
  | "completed"
  | "dropped";

export type OpsQuarterlyPlanPriority = "low" | "medium" | "high" | "critical";

export interface OpsQuarterlyPlan {
  id: string;
  year: number;
  quarter: OpsQuarter;
  title: string;
  description: string;
  domain: OpsBenchmarkDomain;
  status: OpsQuarterlyPlanStatus;
  priority: OpsQuarterlyPlanPriority;
  targetMetric: string;
  targetValue: string;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  relatedRoadmapItemId: string | null;
  milestone: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  note: string;
}

export type OpsPerformanceReviewStatus = "draft" | "published" | "archived";

export interface OpsAdminPerformanceReview {
  id: string;
  reviewPeriod: string;
  adminId: string;
  adminNickname: string;
  incidentContributionScore: number;
  checklistCompletionRate: number;
  actionCompletionRate: number;
  documentContributionScore: number;
  runbookContributionScore: number;
  learningContributionScore: number;
  overallPerformanceScore: number;
  status: OpsPerformanceReviewStatus;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpsBenchmarkSummary {
  averageCurrentScore: number;
  averageTargetScore: number;
  highGapDomainCount: number;
  improvingDomainCount: number;
  decliningDomainCount: number;
  latestBenchmarkDate: string | null;
}

export interface OpsQuarterlyPlanSummary {
  totalPlans: number;
  plannedCount: number;
  inProgressCount: number;
  atRiskCount: number;
  completedCount: number;
  criticalOpenCount: number;
  currentQuarter: string;
  latestUpdatedAt: string | null;
}

export interface OpsPerformanceReviewSummary {
  totalReviewedAdmins: number;
  averageOverallPerformanceScore: number;
  highPerformersCount: number;
  needsAttentionCount: number;
  latestReviewPeriod: string | null;
}
