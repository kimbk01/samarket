/**
 * 53단계: 릴리즈 아카이브 / 버전별 변경 이력 / 회귀 이슈 / 릴리즈 학습 타입
 */

export type ReleaseArchiveStatus =
  | "active"
  | "stable"
  | "deprecated"
  | "rolled_back"
  | "hotfix";

export interface ReleaseArchive {
  id: string;
  releaseVersion: string;
  buildTag: string;
  releaseTitle: string;
  releaseStatus: ReleaseArchiveStatus;
  releaseDate: string;
  summary: string;
  linkedSprintId: string | null;
  linkedDeploymentId: string | null;
  linkedReleaseNoteId: string | null;
  createdAt: string;
  updatedAt: string;
  note: string;
}

export type ReleaseArchiveChangeType =
  | "feature"
  | "improvement"
  | "bugfix"
  | "hotfix"
  | "ops_change"
  | "config_change";

export interface ReleaseArchiveItem {
  id: string;
  releaseArchiveId: string;
  changeType: ReleaseArchiveChangeType;
  title: string;
  description: string;
  linkedBacklogItemId: string | null;
  linkedSprintItemId: string | null;
  linkedQaIssueId: string | null;
  linkedDeploymentId: string | null;
  linkedActionItemId: string | null;
  sortOrder: number;
  createdAt: string;
}

export type RegressionIssueSeverity = "low" | "medium" | "high" | "critical";

export type RegressionIssueStatus =
  | "detected"
  | "investigating"
  | "confirmed"
  | "fixed"
  | "verified"
  | "archived";

export type RegressionCategory =
  | "auth"
  | "product"
  | "feed"
  | "chat"
  | "moderation"
  | "points"
  | "ads"
  | "admin"
  | "ops";

export interface ReleaseRegressionIssue {
  id: string;
  releaseArchiveId: string;
  title: string;
  description: string;
  severity: RegressionIssueSeverity;
  status: RegressionIssueStatus;
  detectedAt: string;
  fixedAt: string | null;
  verifiedAt: string | null;
  ownerAdminId: string | null;
  ownerAdminNickname: string | null;
  linkedQaIssueId: string | null;
  linkedBacklogItemId: string | null;
  linkedHotfixReleaseId: string | null;
  regressionCategory: RegressionCategory;
  note: string;
}

export interface ReleaseLearningNote {
  id: string;
  releaseArchiveId: string;
  whatWentWell: string;
  whatBroke: string;
  regressionSummary: string;
  mitigationSummary: string;
  nextReleaseChecklist: string;
  createdAt: string;
  createdByAdminId: string;
  createdByAdminNickname: string;
}

export interface ReleaseArchiveSummary {
  totalReleases: number;
  activeReleases: number;
  stableReleases: number;
  rolledBackReleases: number;
  totalRegressionIssues: number;
  openRegressionIssues: number;
  criticalRegressionIssues: number;
  averageRegressionPerRelease: number;
  latestReleaseAt: string;
}
