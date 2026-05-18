import type { MessageKey } from "@/lib/i18n/messages";
import type { AuditLogCategory, AuditLogResult } from "@/lib/types/admin-audit";

/** mock/목록 `category` → 메시지 키 */
export const AUDIT_CATEGORY_LABEL_KEYS: Record<AuditLogCategory, MessageKey> = {
  product: "admin_audit_category_product",
  user: "admin_audit_category_user",
  chat: "admin_audit_category_chat",
  report: "admin_audit_category_report",
  review: "admin_audit_category_review",
  setting: "admin_audit_category_setting",
  auth: "admin_audit_category_auth",
};

/** API 상세 `target_type` 등 (카테고리 외 확장) */
export const AUDIT_TARGET_TYPE_LABEL_KEYS: Partial<Record<string, MessageKey>> = {
  ...AUDIT_CATEGORY_LABEL_KEYS,
  user_settings: "admin_audit_target_user_settings",
  store_order: "admin_audit_target_store_order",
};

export const AUDIT_RESULT_LABEL_KEYS: Record<AuditLogResult, MessageKey> = {
  success: "admin_audit_result_success",
  warning: "admin_audit_result_warning",
  error: "admin_audit_result_error",
};
