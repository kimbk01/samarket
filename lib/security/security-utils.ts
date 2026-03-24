/**
 * 56단계: 보안/RLS 점검 라벨 유틸
 */

import type {
  SecurityCheckType,
  SecurityStatus,
  SecurityIssueSeverity,
  SecurityIssueStatus,
} from "@/lib/types/security";

const CHECK_TYPE_LABELS: Record<SecurityCheckType, string> = {
  rls: "RLS",
  api: "API",
  admin: "관리자",
  auth: "인증",
  storage: "스토리지",
};

const STATUS_LABELS: Record<SecurityStatus, string> = {
  safe: "안전",
  warning: "주의",
  critical: "위험",
};

const ISSUE_SEVERITY_LABELS: Record<SecurityIssueSeverity, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const ISSUE_STATUS_LABELS: Record<SecurityIssueStatus, string> = {
  open: "미해결",
  fixed: "해결됨",
};

export function getCheckTypeLabel(v: SecurityCheckType): string {
  return CHECK_TYPE_LABELS[v] ?? v;
}

export function getSecurityStatusLabel(v: SecurityStatus): string {
  return STATUS_LABELS[v] ?? v;
}

export function getIssueSeverityLabel(v: SecurityIssueSeverity): string {
  return ISSUE_SEVERITY_LABELS[v] ?? v;
}

export function getIssueStatusLabel(v: SecurityIssueStatus): string {
  return ISSUE_STATUS_LABELS[v] ?? v;
}
