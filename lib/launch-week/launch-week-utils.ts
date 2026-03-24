/**
 * 49단계: 첫 주 관제 유틸 (라벨)
 */

import type {
  LaunchWeekChecklistArea,
  LaunchWeekChecklistStatus,
  LaunchWeekChecklistPriority,
  LaunchWeekIssueCategory,
  LaunchWeekIssueSeverity,
  LaunchWeekIssueStatus,
  LaunchWeekStabilityStatus,
} from "@/lib/types/launch-week";

const AREA_LABELS: Record<LaunchWeekChecklistArea, string> = {
  auth: "회원가입/로그인",
  product: "상품",
  image_upload: "이미지 업로드",
  chat: "채팅",
  recommendation: "추천 피드",
  moderation: "신고/제재",
  point_payment: "포인트/결제",
  ads_business: "광고/상점",
  admin_ops: "관리자/운영",
};

const CHECKLIST_STATUS_LABELS: Record<LaunchWeekChecklistStatus, string> = {
  todo: "할 일",
  in_progress: "진행중",
  done: "완료",
  blocked: "차단",
};

const PRIORITY_LABELS: Record<LaunchWeekChecklistPriority, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const ISSUE_STATUS_LABELS: Record<LaunchWeekIssueStatus, string> = {
  open: "오픈",
  investigating: "조사중",
  mitigated: "완화됨",
  resolved: "해결됨",
};

const SEVERITY_LABELS: Record<LaunchWeekIssueSeverity, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const STABILITY_LABELS: Record<LaunchWeekStabilityStatus, string> = {
  normal: "정상",
  watch: "주의",
  warning: "경고",
  critical: "위험",
};

export function getAreaLabel(area: LaunchWeekChecklistArea | LaunchWeekIssueCategory): string {
  return AREA_LABELS[area as LaunchWeekChecklistArea] ?? area;
}

export function getChecklistStatusLabel(status: LaunchWeekChecklistStatus): string {
  return CHECKLIST_STATUS_LABELS[status] ?? status;
}

export function getPriorityLabel(priority: LaunchWeekChecklistPriority): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

export function getIssueStatusLabel(status: LaunchWeekIssueStatus): string {
  return ISSUE_STATUS_LABELS[status] ?? status;
}

export function getSeverityLabel(severity: LaunchWeekIssueSeverity): string {
  return SEVERITY_LABELS[severity] ?? severity;
}

export function getStabilityLabel(status: LaunchWeekStabilityStatus): string {
  return STABILITY_LABELS[status] ?? status;
}
