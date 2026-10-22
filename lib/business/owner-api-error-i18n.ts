import type { MessageKey } from "@/lib/i18n/messages";

const KNOWN_CODES: Record<string, MessageKey> = {
  network_error: "common_network_error",
  load_failed: "business_phase7_353",
  review_load_failed: "business_phase7_353",
  save_failed: "business_phase7_368",
  /** PRD-15 — 오너 상품·카테고리 500 응답 고정 코드 (DB 원문 미노출) */
  db_error: "business_phase7_368",
  upload_failed: "business_phase7_440",
  /** IMG-02 — 업로드 상한 초과(서버 413 · 함수 앞단 비 JSON 413 · 클라이언트 압축 실패) */
  file_too_large: "business_image_upload_too_large",
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
  platform_inquiries_table_missing: "store_owner_point_err_platform_unavailable",
  store_point_charge_table_missing: "store_owner_point_err_platform_unavailable",
  point_amount_required: "store_owner_point_err_point_amount_required",
  depositor_name_required: "store_owner_point_err_depositor_name_required",
  subject_and_content_required: "store_owner_point_err_subject_required",
  invalid_json: "common_error",
  // OPS-01 — store_notices 테이블 부재(503)
  store_notices_unavailable: "business_ops3b_err_notices_unavailable",
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
