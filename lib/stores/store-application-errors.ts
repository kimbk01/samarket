/**
 * 매장 입점 신청·보완 제출·매장 전화 인증 — 서버 오류 코드 → 화면 문구 키 (원문 코드 노출 금지 · 1차 감사 A-4).
 * 클라이언트 안전 모듈.
 */
import type { MessageKey } from "@/lib/i18n/messages";

const APPLY_ERROR_KEYS: Record<string, MessageKey> = {
  unauthorized: "business_phase7_681",
  supabase_unconfigured: "business_phase7_682",
  already_has_active_application: "business_phase7_684",
  applicant_nickname_required: "store_apply_err_applicant",
  shopName_required: "store_apply_err_shop_name",
  branch_name_too_long: "store_apply_err_branch_long",
  description_too_long: "store_apply_err_description_long",
  request_note_too_long: "business_phase7_696",
  kakao_id_too_long: "store_apply_err_kakao_long",
  category_slugs_required: "business_phase7_688",
  category_not_found: "store_apply_err_category",
  store_location_required: "store_apply_err_location",
  store_name_duplicate_branch_required: "store_apply_err_name_dup_branch",
  store_name_duplicate: "store_apply_err_name_dup",
  name_check_failed: "store_apply_err_retry",
  master_address_required: "business_phase7_671",
  master_address_load_failed: "store_apply_err_retry",
  owner_not_in_auth_users: "business_phase7_691",
  store_phone_already_registered: "business_phase7_685",
  store_phone_check_failed: "store_apply_err_retry",
  store_phone_verification_required: "store_apply_err_phone_verify",
  store_phone_verification_mismatch: "store_apply_err_phone_verify",
  store_phone_invalid: "store_apply_err_phone_invalid",
  partner_agreement_required: "partner_err_required",
  partner_terms_version_mismatch: "partner_err_version_mismatch",
  not_revision_requested: "store_apply_err_not_revision",
  status_changed: "store_apply_err_not_revision",
  store_not_found: "store_apply_err_retry",
};

export function storeApplicationErrorKey(code: unknown): MessageKey {
  const c = typeof code === "string" ? code : "";
  return APPLY_ERROR_KEYS[c] ?? "business_phase7_692";
}

const PHONE_ERROR_KEYS: Record<string, MessageKey> = {
  store_phone_invalid: "store_apply_err_phone_invalid",
  store_phone_already_registered: "business_phase7_685",
  store_phone_otp_invalid: "store_apply_err_otp_invalid",
  store_phone_otp_expired: "store_apply_err_otp_expired",
  store_phone_otp_required: "store_apply_err_otp_expired",
  store_phone_otp_rate_limited: "store_apply_err_otp_rate",
  store_phone_otp_send_failed: "store_apply_err_otp_send",
  store_phone_verify_disabled: "store_apply_err_otp_send",
};

export function storePhoneVerifyErrorKey(code: unknown): MessageKey {
  const c = typeof code === "string" ? code : "";
  return PHONE_ERROR_KEYS[c] ?? "store_apply_err_retry";
}
