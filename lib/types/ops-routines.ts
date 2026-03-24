/**
 * 50단계: 장기 운영 전환 / 월간 운영 루틴 / 운영 체계 정착 보드 타입
 */

export type OpsRoutineCategory =
  | "monitoring"
  | "moderation"
  | "content"
  | "points"
  | "ads"
  | "recommendation"
  | "docs"
  | "automation"
  | "reporting"
  | "security";

export type OpsRoutineCadence = "weekly" | "monthly" | "quarterly";

export type OpsRoutinePriority = "low" | "medium" | "high" | "critical";

export interface OpsRoutineTemplate {
  id: string;
  title: string;
  category: OpsRoutineCategory;
  cadence: OpsRoutineCadence;
  defaultPriority: OpsRoutinePriority;
  defaultOwnerRole: string;
  slaDays: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type OpsRoutinePeriodType = "weekly" | "monthly" | "quarterly";

export type OpsRoutineExecutionStatus =
  | "todo"
  | "in_progress"
  | "done"
  | "skipped"
  | "overdue";

export type OpsRoutineExecutionLinkedType =
  | "report"
  | "checklist"
  | "action_item"
  | "benchmark"
  | "maturity"
  | "qa"
  | null;

export interface OpsRoutineExecution {
  id: string;
  templateId: string;
  periodKey: string;
  periodType: OpsRoutinePeriodType;
  scheduledDate: string;
  dueDate: string | null;
  status: OpsRoutineExecutionStatus;
  priority: OpsRoutinePriority;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  completedAt: string | null;
  carryOverToNextPeriod: boolean;
  note: string;
  linkedType: OpsRoutineExecutionLinkedType;
  linkedId: string | null;
  updatedAt: string;
}

export type OpsOperationalizationStatusType =
  | "stabilizing"
  | "established"
  | "optimized"
  | "needs_attention";

export interface OpsOperationalizationStatus {
  id: string;
  evaluatedAt: string;
  overallStatus: OpsOperationalizationStatusType;
  routineCompletionRate: number;
  overdueRoutineCount: number;
  carryOverCount: number;
  documentationFreshnessRate: number;
  actionClosureRate: number;
  monthlyReviewDone: boolean;
  benchmarkReviewDone: boolean;
  note: string;
}

export interface OpsMonthlyNote {
  id: string;
  monthKey: string;
  summary: string;
  topRisks: string;
  topWins: string;
  followUpFocus: string;
  createdAt: string;
  createdByAdminId: string;
  createdByAdminNickname: string;
}

export interface OpsRoutineSummary {
  totalRoutines: number;
  completedRoutines: number;
  overdueRoutines: number;
  carryOverRoutines: number;
  monthlyCompletionRate: number;
  weeklyCompletionRate: number;
  quarterlyCompletionRate: number;
  latestUpdatedAt: string | null;
}
