/**
 * 49단계: 오픈 직후 초기 운영 대시보드 / 첫 주 관제 / 안정화 체크리스트 타입
 */

export interface LaunchWeekKpis {
  id: string;
  observedDate: string;
  signUpCount: number;
  productCreatedCount: number;
  chatStartedCount: number;
  transactionCompletedCount: number;
  reportCreatedCount: number;
  incidentCount: number;
  fallbackCount: number;
  killSwitchCount: number;
  pointChargeRequestCount: number;
  adApplicationCount: number;
  createdAt: string;
}

export type LaunchWeekDayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type LaunchWeekChecklistArea =
  | "auth"
  | "product"
  | "image_upload"
  | "chat"
  | "recommendation"
  | "moderation"
  | "point_payment"
  | "ads_business"
  | "admin_ops";

export type LaunchWeekChecklistStatus =
  | "todo"
  | "in_progress"
  | "done"
  | "blocked";

export type LaunchWeekChecklistPriority =
  | "low"
  | "medium"
  | "high"
  | "critical";

export interface LaunchWeekChecklistItem {
  id: string;
  dayNumber: LaunchWeekDayNumber;
  area: LaunchWeekChecklistArea;
  title: string;
  description: string;
  status: LaunchWeekChecklistStatus;
  priority: LaunchWeekChecklistPriority;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  blockerReason: string | null;
  note: string;
  checkedAt: string | null;
  updatedAt: string;
}

export type LaunchWeekIssueCategory =
  | "auth"
  | "product"
  | "image_upload"
  | "chat"
  | "recommendation"
  | "moderation"
  | "point_payment"
  | "ads_business"
  | "admin_ops";

export type LaunchWeekIssueSeverity =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type LaunchWeekIssueStatus =
  | "open"
  | "investigating"
  | "mitigated"
  | "resolved";

export type LaunchWeekIssueLinkedType =
  | "incident"
  | "deployment"
  | "qa_issue"
  | "action_item"
  | "alert_event"
  | null;

export interface LaunchWeekIssue {
  id: string;
  title: string;
  category: LaunchWeekIssueCategory;
  severity: LaunchWeekIssueSeverity;
  status: LaunchWeekIssueStatus;
  linkedType: LaunchWeekIssueLinkedType;
  linkedId: string | null;
  dayNumber: LaunchWeekDayNumber;
  openedAt: string;
  resolvedAt: string | null;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  note: string;
}

export type LaunchWeekStabilityStatus =
  | "normal"
  | "watch"
  | "warning"
  | "critical";

export interface LaunchWeekSummary {
  currentDay: LaunchWeekDayNumber;
  currentStabilityStatus: LaunchWeekStabilityStatus;
  openIssueCount: number;
  criticalIssueCount: number;
  blockedChecklistCount: number;
  fallbackToday: number;
  killSwitchToday: number;
  totalChecklistDone: number;
  totalChecklistCount: number;
  latestUpdatedAt: string | null;
}

export interface LaunchWeekDailyNote {
  id: string;
  dayNumber: LaunchWeekDayNumber;
  summary: string;
  topIssues: string;
  topWins: string;
  handoffNote: string;
  createdAt: string;
  createdByAdminId: string;
  createdByAdminNickname: string;
}
