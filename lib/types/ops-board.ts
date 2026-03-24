/**
 * 38단계: 일일 점검 체크리스트 / 운영 회고 / 액션아이템 타입
 */

export type OpsChecklistCategory =
  | "monitoring"
  | "feed"
  | "ads"
  | "moderation"
  | "reports"
  | "automation";

export type OpsSurface = "all" | "home" | "search" | "shop";

export type OpsChecklistPriority = "low" | "medium" | "high" | "critical";

export type OpsChecklistItemStatus =
  | "todo"
  | "in_progress"
  | "done"
  | "skipped"
  | "blocked";

export interface OpsChecklistTemplate {
  id: string;
  title: string;
  category: OpsChecklistCategory;
  defaultSurface: OpsSurface;
  defaultPriority: OpsChecklistPriority;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  adminMemo: string;
}

export interface OpsDailyChecklistItem {
  id: string;
  checklistDate: string;
  templateId: string;
  title: string;
  category: OpsChecklistCategory;
  surface: OpsSurface;
  status: OpsChecklistItemStatus;
  priority: OpsChecklistPriority;
  assignedAdminId: string | null;
  assignedAdminNickname: string | null;
  checkedAt: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpsRetrospective {
  id: string;
  retrospectiveDate: string;
  title: string;
  summary: string;
  wins: string;
  issues: string;
  learnings: string;
  nextActions: string;
  relatedSurface: OpsSurface;
  relatedReportId: string | null;
  createdAt: string;
  createdByAdminId: string;
  createdByAdminNickname: string;
}

export type OpsActionSourceType =
  | "checklist"
  | "retrospective"
  | "incident"
  | "report"
  | "deployment"
  | "manual";

export type OpsActionStatus =
  | "open"
  | "planned"
  | "in_progress"
  | "done"
  | "archived";

export interface OpsActionItem {
  id: string;
  title: string;
  description: string;
  sourceType: OpsActionSourceType;
  sourceId: string | null;
  relatedSurface: OpsSurface;
  status: OpsActionStatus;
  priority: OpsChecklistPriority;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  note: string;
}

export interface OpsActionSummary {
  checklistCompletionRate: number;
  totalOpenActions: number;
  overdueActions: number;
  highPriorityOpenActions: number;
  latestRetrospectiveAt: string | null;
  todayChecklistCount: number;
}
