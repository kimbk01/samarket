/**
 * 51단계: 제품 백로그/피드백 라벨 유틸
 */

import type {
  ProductFeedbackSourceType,
  ProductFeedbackCategory,
  ProductFeedbackSeverity,
  ProductFeedbackStatus,
  ProductBacklogStatus,
  ProductBacklogPriority,
  ProductBacklogOwnerType,
  OpsDevHandoffStatus,
} from "@/lib/types/product-backlog";

const SOURCE_LABELS: Record<ProductFeedbackSourceType, string> = {
  user_feedback: "사용자 피드백",
  cs_inquiry: "CS 문의",
  report: "신고",
  ops_note: "운영 메모",
  qa_issue: "QA 이슈",
  analytics_signal: "분석 시그널",
};

const CATEGORY_LABELS: Record<ProductFeedbackCategory, string> = {
  onboarding: "온보딩",
  product_posting: "상품 등록",
  feed_quality: "피드 품질",
  chat: "채팅",
  moderation: "신고/제재",
  points_payment: "포인트/결제",
  ads_business: "광고/비즈",
  admin_console: "관리자",
  performance: "성능",
  bug: "버그",
};

const SEVERITY_LABELS: Record<ProductFeedbackSeverity, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const FEEDBACK_STATUS_LABELS: Record<ProductFeedbackStatus, string> = {
  new: "신규",
  reviewed: "검토됨",
  converted: "백로그 전환",
  ignored: "무시",
};

const BACKLOG_STATUS_LABELS: Record<ProductBacklogStatus, string> = {
  inbox: "인박스",
  triaged: "분류됨",
  planned: "예정",
  in_progress: "진행중",
  released: "릴리즈",
  rejected: "반려",
  archived: "보관",
};

const PRIORITY_LABELS: Record<ProductBacklogPriority, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const OWNER_TYPE_LABELS: Record<ProductBacklogOwnerType, string> = {
  ops: "운영",
  dev: "개발",
  shared: "공유",
};

const HANDOFF_STATUS_LABELS: Record<OpsDevHandoffStatus, string> = {
  pending: "대기",
  accepted: "수락",
  in_progress: "진행중",
  shipped: "완료",
  returned: "반려",
};

export function getSourceLabel(v: ProductFeedbackSourceType): string {
  return SOURCE_LABELS[v] ?? v;
}

export function getCategoryLabel(v: ProductFeedbackCategory): string {
  return CATEGORY_LABELS[v] ?? v;
}

export function getSeverityLabel(v: ProductFeedbackSeverity): string {
  return SEVERITY_LABELS[v] ?? v;
}

export function getFeedbackStatusLabel(v: ProductFeedbackStatus): string {
  return FEEDBACK_STATUS_LABELS[v] ?? v;
}

export function getBacklogStatusLabel(v: ProductBacklogStatus): string {
  return BACKLOG_STATUS_LABELS[v] ?? v;
}

export function getPriorityLabel(v: ProductBacklogPriority): string {
  return PRIORITY_LABELS[v] ?? v;
}

export function getOwnerTypeLabel(v: ProductBacklogOwnerType): string {
  return OWNER_TYPE_LABELS[v] ?? v;
}

export function getHandoffStatusLabel(v: OpsDevHandoffStatus): string {
  return HANDOFF_STATUS_LABELS[v] ?? v;
}
