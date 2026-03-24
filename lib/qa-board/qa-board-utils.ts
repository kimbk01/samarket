/**
 * 48단계: QA 보드 유틸 (라벨)
 */

import type {
  QaTestDomain,
  QaTestCaseStatus,
  QaTestCasePriority,
  QaTestEnvironment,
  QaPilotCategory,
  QaIssueSeverity,
  QaIssueStatus,
  QaGoLiveDecision,
} from "@/lib/types/qa-board";

const DOMAIN_LABELS: Record<QaTestDomain, string> = {
  auth: "회원가입/로그인",
  product: "상품 등록/수정/삭제",
  feed: "홈/검색/추천",
  chat: "채팅/거래상태",
  moderation: "신고/제재",
  point_payment: "포인트/결제",
  ads_business: "광고/상점",
  admin_console: "관리자 콘솔",
  ops: "운영 도구",
  security: "보안/RLS",
};

const CASE_STATUS_LABELS: Record<QaTestCaseStatus, string> = {
  not_started: "미실행",
  in_progress: "진행중",
  passed: "통과",
  failed: "실패",
  blocked: "차단",
};

const PRIORITY_LABELS: Record<QaTestCasePriority, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const ENV_LABELS: Record<QaTestEnvironment, string> = {
  local: "Local",
  staging: "Staging",
  production_candidate: "Production 후보",
};

const PILOT_CATEGORY_LABELS: Record<QaPilotCategory, string> = {
  onboarding: "온보딩",
  browsing: "둘러보기",
  posting: "등록",
  chat: "채팅",
  reporting: "신고",
  points: "포인트",
  admin_response: "관리자 응답",
};

const PILOT_STATUS_LABELS: Record<string, string> = {
  todo: "할 일",
  in_progress: "진행중",
  done: "완료",
  blocked: "차단",
};

const SEVERITY_LABELS: Record<QaIssueSeverity, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const ISSUE_STATUS_LABELS: Record<QaIssueStatus, string> = {
  open: "오픈",
  in_progress: "진행중",
  fixed: "수정됨",
  verified: "검증됨",
  wont_fix: "미해결",
};

export function getDomainLabel(domain: QaTestDomain): string {
  return DOMAIN_LABELS[domain] ?? domain;
}

export function getCaseStatusLabel(status: QaTestCaseStatus): string {
  return CASE_STATUS_LABELS[status] ?? status;
}

export function getPriorityLabel(priority: QaTestCasePriority): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

export function getEnvLabel(env: QaTestEnvironment): string {
  return ENV_LABELS[env] ?? env;
}

export function getPilotCategoryLabel(category: QaPilotCategory): string {
  return PILOT_CATEGORY_LABELS[category] ?? category;
}

export function getPilotStatusLabel(status: string): string {
  return PILOT_STATUS_LABELS[status] ?? status;
}

export function getSeverityLabel(severity: QaIssueSeverity): string {
  return SEVERITY_LABELS[severity] ?? severity;
}

export function getIssueStatusLabel(status: QaIssueStatus): string {
  return ISSUE_STATUS_LABELS[status] ?? status;
}

export function getGoLiveQaLabel(dec: QaGoLiveDecision): string {
  if (dec === "go") return "Go";
  if (dec === "conditional_go") return "조건부 Go";
  return "No-Go";
}
