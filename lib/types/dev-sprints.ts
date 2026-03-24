/**
 * 52단계: 개발 스프린트 / 릴리즈 노트 / 배포 후 검증 타입
 */

export type DevSprintStatus =
  | "planned"
  | "active"
  | "completed"
  | "archived";

export interface DevSprint {
  id: string;
  sprintName: string;
  sprintGoal: string;
  startDate: string;
  endDate: string;
  status: DevSprintStatus;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  createdAt: string;
  updatedAt: string;
  note: string;
}

export type DevSprintItemStatus =
  | "todo"
  | "in_progress"
  | "review"
  | "qa_ready"
  | "done"
  | "blocked";

export type DevSprintItemPriority = "low" | "medium" | "high" | "critical";

export type DevSprintItemOwnerType = "dev" | "ops" | "shared";

export interface DevSprintItem {
  id: string;
  sprintId: string;
  backlogItemId: string;
  title: string;
  description: string;
  status: DevSprintItemStatus;
  priority: DevSprintItemPriority;
  ownerType: DevSprintItemOwnerType;
  ownerName: string;
  linkedQaIssueId: string | null;
  linkedActionItemId: string | null;
  linkedDeploymentId: string | null;
  estimatePoint: number | null;
  completedAt: string | null;
  blockerReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ReleaseNoteStatus = "draft" | "published" | "archived";

export interface ReleaseNote {
  id: string;
  releaseVersion: string;
  buildTag: string;
  title: string;
  summary: string;
  includedSprintId: string | null;
  status: ReleaseNoteStatus;
  releaseDate: string | null;
  createdAt: string;
  updatedAt: string;
  createdByAdminId: string;
  createdByAdminNickname: string;
}

export type ReleaseNoteItemType =
  | "feature"
  | "bugfix"
  | "improvement"
  | "ops_change"
  | "hotfix";

export interface ReleaseNoteItem {
  id: string;
  releaseNoteId: string;
  itemType: ReleaseNoteItemType;
  title: string;
  description: string;
  linkedBacklogItemId: string | null;
  linkedSprintItemId: string | null;
  linkedQaIssueId: string | null;
  linkedDeploymentId: string | null;
  sortOrder: number;
  createdAt: string;
}

export type PostReleaseCheckPhase =
  | "before_release"
  | "just_after_release"
  | "after_24h"
  | "after_72h";

export type PostReleaseCheckStatus =
  | "todo"
  | "in_progress"
  | "done"
  | "blocked";

export type PostReleaseCheckPriority = "low" | "medium" | "high" | "critical";

export type PostReleaseCheckLinkedType =
  | "deployment"
  | "qa_issue"
  | "report"
  | "incident"
  | "backlog_item"
  | null;

export interface PostReleaseCheck {
  id: string;
  releaseVersion: string;
  phase: PostReleaseCheckPhase;
  title: string;
  description: string;
  status: PostReleaseCheckStatus;
  priority: PostReleaseCheckPriority;
  linkedType: PostReleaseCheckLinkedType;
  linkedId: string | null;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  checkedAt: string | null;
  blockerReason: string | null;
  note: string;
  updatedAt: string;
}

export interface DevSprintSummary {
  totalSprints: number;
  activeSprints: number;
  totalItems: number;
  completedItems: number;
  blockedItems: number;
  averageVelocity: number;
  latestReleaseVersion: string | null;
  latestUpdatedAt: string;
}
