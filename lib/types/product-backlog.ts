/**
 * 51단계: 제품 개선 백로그 / 사용자 피드백 / 운영-개발 연동 타입
 */

export type ProductFeedbackSourceType =
  | "user_feedback"
  | "cs_inquiry"
  | "report"
  | "ops_note"
  | "qa_issue"
  | "analytics_signal";

export type ProductFeedbackCategory =
  | "onboarding"
  | "product_posting"
  | "feed_quality"
  | "chat"
  | "moderation"
  | "points_payment"
  | "ads_business"
  | "admin_console"
  | "performance"
  | "bug";

export type ProductFeedbackSeverity = "low" | "medium" | "high" | "critical";

export type ProductFeedbackStatus =
  | "new"
  | "reviewed"
  | "converted"
  | "ignored";

export type ProductFeedbackLinkedType =
  | "inquiry"
  | "report"
  | "qa_issue"
  | "action_item"
  | "analytics"
  | null;

export interface ProductFeedbackItem {
  id: string;
  sourceType: ProductFeedbackSourceType;
  title: string;
  description: string;
  category: ProductFeedbackCategory;
  severity: ProductFeedbackSeverity;
  feedbackStatus: ProductFeedbackStatus;
  sourceUserId: string | null;
  sourceUserNickname: string | null;
  linkedType: ProductFeedbackLinkedType;
  linkedId: string | null;
  createdAt: string;
  updatedAt: string;
  note: string;
}

export type ProductBacklogStatus =
  | "inbox"
  | "triaged"
  | "planned"
  | "in_progress"
  | "released"
  | "rejected"
  | "archived";

export type ProductBacklogPriority = "low" | "medium" | "high" | "critical";

export type ProductBacklogOwnerType = "ops" | "dev" | "shared";

export interface ProductBacklogItem {
  id: string;
  title: string;
  description: string;
  category: ProductFeedbackCategory;
  status: ProductBacklogStatus;
  priority: ProductBacklogPriority;
  impactScore: number;
  effortScore: number;
  ownerType: ProductBacklogOwnerType;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  sourceFeedbackId: string | null;
  linkedRoadmapItemId: string | null;
  linkedActionItemId: string | null;
  linkedQaIssueId: string | null;
  linkedReportId: string | null;
  releaseVersion: string | null;
  createdAt: string;
  updatedAt: string;
  releasedAt: string | null;
  handoffNote: string;
}

export type OpsDevHandoffStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "shipped"
  | "returned";

export interface OpsDevHandoffItem {
  id: string;
  backlogItemId: string;
  handoffStatus: OpsDevHandoffStatus;
  opsSummary: string;
  devNote: string;
  acceptanceCriteria: string;
  requestedByAdminId: string | null;
  requestedByAdminNickname: string | null;
  assignedDevName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductBacklogSummary {
  totalFeedbackItems: number;
  totalBacklogItems: number;
  inboxCount: number;
  plannedCount: number;
  inProgressCount: number;
  releasedCount: number;
  topCategory: ProductFeedbackCategory | null;
  latestUpdatedAt: string;
}
