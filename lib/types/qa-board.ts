/**
 * 48단계: 최종 통합 QA 보드 / 실사용자 시범운영 / 오픈 직전 점검 타입
 */

export type QaTestDomain =
  | "auth"
  | "product"
  | "feed"
  | "chat"
  | "moderation"
  | "point_payment"
  | "ads_business"
  | "admin_console"
  | "ops"
  | "security";

export interface QaTestSuite {
  id: string;
  domain: QaTestDomain;
  title: string;
  description: string;
  isCritical: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type QaTestCaseStatus =
  | "not_started"
  | "in_progress"
  | "passed"
  | "failed"
  | "blocked";

export type QaTestCasePriority = "low" | "medium" | "high" | "critical";

export type QaTestEnvironment =
  | "local"
  | "staging"
  | "production_candidate";

export type QaTestCaseLinkedType =
  | "action_item"
  | "deployment"
  | "readiness_item"
  | "migration_table"
  | "report"
  | null;

export interface QaTestCase {
  id: string;
  suiteId: string;
  title: string;
  description: string;
  area: string;
  status: QaTestCaseStatus;
  priority: QaTestCasePriority;
  isMustPass: boolean;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  executedAt: string | null;
  environment: QaTestEnvironment;
  linkedType: QaTestCaseLinkedType;
  linkedId: string | null;
  failureNote: string | null;
  blockerReason: string | null;
  updatedAt: string;
}

export type QaPilotCategory =
  | "onboarding"
  | "browsing"
  | "posting"
  | "chat"
  | "reporting"
  | "points"
  | "admin_response";

export type QaPilotCheckStatus = "todo" | "in_progress" | "done" | "blocked";

export interface QaPilotCheck {
  id: string;
  title: string;
  category: QaPilotCategory;
  status: QaPilotCheckStatus;
  assignedAdminId: string | null;
  assignedAdminNickname: string | null;
  note: string;
  updatedAt: string;
}

export type QaIssueSeverity = "low" | "medium" | "high" | "critical";

export type QaIssueStatus =
  | "open"
  | "in_progress"
  | "fixed"
  | "verified"
  | "wont_fix";

export type QaIssueLinkedType =
  | "product"
  | "feed"
  | "chat"
  | "admin"
  | "ops"
  | "security"
  | null;

export interface QaIssueLog {
  id: string;
  title: string;
  severity: QaIssueSeverity;
  status: QaIssueStatus;
  relatedTestCaseId: string | null;
  linkedType: QaIssueLinkedType;
  linkedId: string | null;
  reproduced: boolean | null;
  createdAt: string;
  updatedAt: string;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  note: string;
}

export type QaGoLiveDecision = "go" | "conditional_go" | "no_go";

export interface QaSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  blockedCases: number;
  criticalOpenIssues: number;
  mustPassTotal: number;
  mustPassPassed: number;
  pilotDoneCount: number;
  pilotTotalCount: number;
  goLiveQaDecision: QaGoLiveDecision;
  latestUpdatedAt: string | null;
}
