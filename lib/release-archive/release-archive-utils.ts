/**
 * 53단계: 릴리즈 아카이브 / 회귀 이슈 라벨 유틸
 */

import type {
  ReleaseArchiveStatus,
  ReleaseArchiveChangeType,
  RegressionIssueSeverity,
  RegressionIssueStatus,
  RegressionCategory,
} from "@/lib/types/release-archive";

const RELEASE_STATUS_LABELS: Record<ReleaseArchiveStatus, string> = {
  active: "활성",
  stable: "안정",
  deprecated: "폐예정",
  rolled_back: "롤백",
  hotfix: "핫픽스",
};

const CHANGE_TYPE_LABELS: Record<ReleaseArchiveChangeType, string> = {
  feature: "기능",
  improvement: "개선",
  bugfix: "버그수정",
  hotfix: "핫픽스",
  ops_change: "운영변경",
  config_change: "설정변경",
};

const REGRESSION_SEVERITY_LABELS: Record<RegressionIssueSeverity, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const REGRESSION_STATUS_LABELS: Record<RegressionIssueStatus, string> = {
  detected: "감지됨",
  investigating: "조사중",
  confirmed: "확인됨",
  fixed: "수정됨",
  verified: "검증됨",
  archived: "보관",
};

const REGRESSION_CATEGORY_LABELS: Record<RegressionCategory, string> = {
  auth: "인증",
  product: "상품",
  feed: "피드",
  chat: "채팅",
  moderation: "신고/제재",
  points: "포인트",
  ads: "광고",
  admin: "관리자",
  ops: "운영",
};

export function getReleaseStatusLabel(v: ReleaseArchiveStatus): string {
  return RELEASE_STATUS_LABELS[v] ?? v;
}

export function getChangeTypeLabel(v: ReleaseArchiveChangeType): string {
  return CHANGE_TYPE_LABELS[v] ?? v;
}

export function getRegressionSeverityLabel(v: RegressionIssueSeverity): string {
  return REGRESSION_SEVERITY_LABELS[v] ?? v;
}

export function getRegressionStatusLabel(v: RegressionIssueStatus): string {
  return REGRESSION_STATUS_LABELS[v] ?? v;
}

export function getRegressionCategoryLabel(v: RegressionCategory): string {
  return REGRESSION_CATEGORY_LABELS[v] ?? v;
}
