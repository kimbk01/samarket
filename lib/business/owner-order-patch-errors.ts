import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

const PATCH_ERR_KEYS: Record<string, MessageKey> = {
  prep_minutes_required: "store_biz_patch_err_prep_minutes",
  invalid_transition: "store_biz_patch_err_invalid_transition",
  order_admin_locked: "store_biz_patch_err_admin_locked",
  cancel_reason_required: "store_biz_patch_err_cancel_reason_required",
  cancel_not_allowed_for_status: "store_owner_cancel_not_allowed",
  store_points_insufficient: "store_biz_patch_err_points_insufficient",
  store_commission_policy_missing: "store_biz_patch_err_commission_policy_missing",
  store_commission_charge_failed: "store_biz_patch_err_commission_failed",
};

/** 코드 → 화면 문구. 모르는 코드·서버 문장은 원문 대신 기본 키 (재감사 2026-11-27) */
export function formatOwnerOrderPatchErr(code: string, lang: AppLanguageCode): string {
  const key = PATCH_ERR_KEYS[code] ?? "owner_order_err_action_failed";
  return translate(lang, key);
}

export function formatOwnerOrderPatchErrAfterReconcile(lang: AppLanguageCode): string {
  return translate(lang, "store_biz_patch_err_stale_reconciled");
}
