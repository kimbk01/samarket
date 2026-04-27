import type { MessageKey } from "@/lib/i18n/messages";

/** 신고 `status` → 메시지 키 */
export const REPORT_STATUS_LABEL_KEYS: Partial<Record<string, MessageKey>> = {
  pending: "admin_dashboard_report_pending",
  reviewing: "admin_report_status_reviewing",
  reviewed: "admin_dashboard_report_reviewed",
  resolved: "admin_report_status_resolved",
  rejected: "admin_dashboard_report_rejected",
  sanctioned: "admin_report_status_sanctioned",
};

/** 신고 `targetType` → 메시지 키 (목록·상세 공통) */
export const REPORT_TARGET_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  product: "admin_report_target_product",
  chat: "admin_report_target_chat",
  user: "admin_report_target_user",
  community: "admin_report_target_community_feed",
};

/** report_actions / 제재 버튼 / 처리 이력 액션 타입 */
export const REPORT_ACTION_TYPE_KEYS: Partial<Record<string, MessageKey>> = {
  reject: "admin_report_action_reject",
  reject_report: "admin_report_action_reject",
  warn: "admin_report_action_warn",
  chat_ban: "admin_report_action_chat_ban",
  product_hide: "admin_report_action_product_hide",
  account_suspend: "admin_report_action_account_suspend",
  account_ban: "admin_report_action_account_ban",
  review_only: "admin_report_moderation_review_only",
  suspend: "admin_report_moderation_suspend",
  ban: "admin_report_moderation_ban",
  blind_product: "admin_report_moderation_blind_product",
  delete_product: "admin_report_moderation_delete_product",
};

export function messageKeyForReportAction(code: string): MessageKey | undefined {
  return REPORT_ACTION_TYPE_KEYS[code];
}
