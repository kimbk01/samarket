import type { MessageKey } from "@/lib/i18n/messages";

const KNOWN_CODES: Record<string, MessageKey> = {
  network_error: "common_network_error",
  load_failed: "business_phase7_353",
  review_load_failed: "business_phase7_353",
  save_failed: "business_phase7_368",
  upload_failed: "business_phase7_440",
  reply_failed: "business_phase7_368",
  delete_reply_failed: "business_phase7_352",
  delete_failed: "business_phase7_352",
  unauthorized: "common_login_required",
  missing_ids: "store_owner_order_not_found",
  order_not_found: "store_owner_order_not_found",
  order_lookup_failed: "store_owner_order_not_found",
  review_not_found: "store_owner_order_review_unavailable",
  supabase_unconfigured: "common_content_unavailable",
  table_missing: "store_owner_order_review_unavailable",
  account_inquiry_required: "store_owner_point_err_account_inquiry_required",
  account_inquiry_not_answered: "store_owner_point_err_account_inquiry_not_answered",
  charge_already_pending: "store_owner_point_err_charge_already_pending",
  account_inquiry_already_open: "store_owner_point_err_account_inquiry_already_open",
};

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** 사장님·비즈 API `error` 코드·폴백 문자열 → `t()` 메시지 */
export function resolveOwnerApiErrorMessage(codeOrMessage: string | null | undefined, t: TranslateFn): string {
  const raw = (codeOrMessage ?? "").trim();
  if (!raw) return t("common_error");
  const key = KNOWN_CODES[raw];
  if (key) return t(key);
  if (/^[a-z][a-z0-9_]*$/.test(raw)) return t("business_phase7_426");
  return raw;
}
