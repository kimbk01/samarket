/**
 * 51단계: 제품 백로그/피드백 라벨 유틸 (i18n MessageKey)
 */

import type { MessageKey } from "@/lib/i18n/messages";
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

export type ProductBacklogTranslate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;

const SOURCE_KEYS: Record<ProductFeedbackSourceType, MessageKey> = {
  user_feedback: "admin_product_backlog_source_user_feedback",
  cs_inquiry: "admin_product_backlog_source_cs_inquiry",
  report: "admin_product_backlog_source_report",
  ops_note: "admin_product_backlog_source_ops_note",
  qa_issue: "admin_product_backlog_source_qa_issue",
  analytics_signal: "admin_product_backlog_source_analytics_signal",
};

const CATEGORY_KEYS: Record<ProductFeedbackCategory, MessageKey> = {
  onboarding: "admin_product_backlog_cat_onboarding",
  product_posting: "admin_product_backlog_cat_product_posting",
  feed_quality: "admin_product_backlog_cat_feed_quality",
  chat: "admin_product_backlog_cat_chat",
  moderation: "admin_product_backlog_cat_moderation",
  points_payment: "admin_product_backlog_cat_points_payment",
  ads_business: "admin_product_backlog_cat_ads_business",
  admin_console: "admin_product_backlog_cat_admin_console",
  performance: "admin_product_backlog_cat_performance",
  bug: "admin_product_backlog_cat_bug",
};

const SEVERITY_KEYS: Record<ProductFeedbackSeverity, MessageKey> = {
  low: "admin_product_backlog_severity_low",
  medium: "admin_product_backlog_severity_medium",
  high: "admin_product_backlog_severity_high",
  critical: "admin_product_backlog_severity_critical",
};

const FEEDBACK_STATUS_KEYS: Record<ProductFeedbackStatus, MessageKey> = {
  new: "admin_product_backlog_feedback_status_new",
  reviewed: "admin_product_backlog_feedback_status_reviewed",
  converted: "admin_product_backlog_feedback_status_converted",
  ignored: "admin_product_backlog_feedback_status_ignored",
};

const BACKLOG_STATUS_KEYS: Record<ProductBacklogStatus, MessageKey> = {
  inbox: "admin_product_backlog_backlog_status_inbox",
  triaged: "admin_product_backlog_backlog_status_triaged",
  planned: "admin_product_backlog_backlog_status_planned",
  in_progress: "admin_product_backlog_backlog_status_in_progress",
  released: "admin_product_backlog_backlog_status_released",
  rejected: "admin_product_backlog_backlog_status_rejected",
  archived: "admin_product_backlog_backlog_status_archived",
};

const PRIORITY_KEYS: Record<ProductBacklogPriority, MessageKey> = {
  low: "admin_product_backlog_priority_low",
  medium: "admin_product_backlog_priority_medium",
  high: "admin_product_backlog_priority_high",
  critical: "admin_product_backlog_priority_critical",
};

const OWNER_TYPE_KEYS: Record<ProductBacklogOwnerType, MessageKey> = {
  ops: "admin_product_backlog_owner_ops",
  dev: "admin_product_backlog_owner_dev",
  shared: "admin_product_backlog_owner_shared",
};

const HANDOFF_STATUS_KEYS: Record<OpsDevHandoffStatus, MessageKey> = {
  pending: "admin_product_backlog_handoff_pending",
  accepted: "admin_product_backlog_handoff_accepted",
  in_progress: "admin_product_backlog_handoff_in_progress",
  shipped: "admin_product_backlog_handoff_shipped",
  returned: "admin_product_backlog_handoff_returned",
};

export const PRODUCT_BACKLOG_CATEGORY_FILTER_OPTIONS = [
  { value: "", labelKey: "common_all" as const },
  { value: "onboarding", labelKey: "admin_product_backlog_cat_onboarding" as const },
  { value: "product_posting", labelKey: "admin_product_backlog_cat_product_posting" as const },
  { value: "feed_quality", labelKey: "admin_product_backlog_cat_feed_quality" as const },
  { value: "chat", labelKey: "admin_product_backlog_cat_chat" as const },
  { value: "moderation", labelKey: "admin_product_backlog_cat_moderation" as const },
  { value: "points_payment", labelKey: "admin_product_backlog_cat_points_payment" as const },
  { value: "ads_business", labelKey: "admin_product_backlog_cat_ads_business" as const },
  { value: "admin_console", labelKey: "admin_product_backlog_cat_admin_console" as const },
  { value: "performance", labelKey: "admin_product_backlog_cat_performance" as const },
  { value: "bug", labelKey: "admin_product_backlog_cat_bug" as const },
] satisfies { value: ProductFeedbackCategory | ""; labelKey: MessageKey }[];

export const PRODUCT_BACKLOG_BOARD_STATUS_FILTER_OPTIONS = [
  { value: "", labelKey: "admin_product_backlog_filter_all_kanban" as const },
  { value: "inbox", labelKey: "admin_product_backlog_backlog_status_inbox" as const },
  { value: "triaged", labelKey: "admin_product_backlog_backlog_status_triaged" as const },
  { value: "planned", labelKey: "admin_product_backlog_backlog_status_planned" as const },
  { value: "in_progress", labelKey: "admin_product_backlog_backlog_status_in_progress" as const },
  { value: "released", labelKey: "admin_product_backlog_backlog_status_released" as const },
] satisfies { value: ProductBacklogStatus | ""; labelKey: MessageKey }[];

export const PRODUCT_FEEDBACK_SOURCE_FILTER_OPTIONS = [
  { value: "", labelKey: "common_all" as const },
  { value: "user_feedback", labelKey: "admin_product_backlog_source_user_feedback" as const },
  { value: "cs_inquiry", labelKey: "admin_product_backlog_source_cs_inquiry" as const },
  { value: "report", labelKey: "admin_product_backlog_source_report" as const },
  { value: "ops_note", labelKey: "admin_product_backlog_source_ops_note" as const },
  { value: "qa_issue", labelKey: "admin_product_backlog_source_qa_issue" as const },
  { value: "analytics_signal", labelKey: "admin_product_backlog_source_analytics_signal" as const },
] satisfies { value: ProductFeedbackSourceType | ""; labelKey: MessageKey }[];

export const PRODUCT_FEEDBACK_STATUS_FILTER_OPTIONS = [
  { value: "", labelKey: "common_all" as const },
  { value: "new", labelKey: "admin_product_backlog_feedback_status_new" as const },
  { value: "reviewed", labelKey: "admin_product_backlog_feedback_status_reviewed" as const },
  { value: "converted", labelKey: "admin_product_backlog_feedback_status_converted" as const },
  { value: "ignored", labelKey: "admin_product_backlog_feedback_status_ignored" as const },
] satisfies { value: ProductFeedbackStatus | ""; labelKey: MessageKey }[];

export const OPS_DEV_HANDOFF_STATUS_FILTER_OPTIONS = [
  { value: "", labelKey: "common_all" as const },
  { value: "pending", labelKey: "admin_product_backlog_handoff_pending" as const },
  { value: "accepted", labelKey: "admin_product_backlog_handoff_accepted" as const },
  { value: "in_progress", labelKey: "admin_product_backlog_handoff_in_progress" as const },
  { value: "shipped", labelKey: "admin_product_backlog_handoff_shipped" as const },
  { value: "returned", labelKey: "admin_product_backlog_handoff_returned" as const },
] satisfies { value: OpsDevHandoffStatus | ""; labelKey: MessageKey }[];

export function getSourceLabel(t: ProductBacklogTranslate, v: ProductFeedbackSourceType): string {
  return t(SOURCE_KEYS[v] ?? (v as MessageKey));
}

export function getCategoryLabel(t: ProductBacklogTranslate, v: ProductFeedbackCategory): string {
  return t(CATEGORY_KEYS[v] ?? (v as MessageKey));
}

export function getSeverityLabel(t: ProductBacklogTranslate, v: ProductFeedbackSeverity): string {
  return t(SEVERITY_KEYS[v] ?? (v as MessageKey));
}

export function getFeedbackStatusLabel(t: ProductBacklogTranslate, v: ProductFeedbackStatus): string {
  return t(FEEDBACK_STATUS_KEYS[v] ?? (v as MessageKey));
}

export function getBacklogStatusLabel(t: ProductBacklogTranslate, v: ProductBacklogStatus): string {
  return t(BACKLOG_STATUS_KEYS[v] ?? (v as MessageKey));
}

export function getPriorityLabel(t: ProductBacklogTranslate, v: ProductBacklogPriority): string {
  return t(PRIORITY_KEYS[v] ?? (v as MessageKey));
}

export function getOwnerTypeLabel(t: ProductBacklogTranslate, v: ProductBacklogOwnerType): string {
  return t(OWNER_TYPE_KEYS[v] ?? (v as MessageKey));
}

export function getHandoffStatusLabel(t: ProductBacklogTranslate, v: OpsDevHandoffStatus): string {
  return t(HANDOFF_STATUS_KEYS[v] ?? (v as MessageKey));
}

export function productBacklogDateLocale(language: string): string {
  if (language === "ko") return "ko-KR";
  if (language === "zh-CN") return "zh-CN";
  return "en-US";
}
