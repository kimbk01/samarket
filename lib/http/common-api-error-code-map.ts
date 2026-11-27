/**
 * 공통 서버 오류 코드 → 문구 키 — 언어 재감사 2026-11-27 (설계 `docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md` §4-1).
 *
 * 공통 함수(`lib/http/api-route.ts`·`lib/security/rate-limit-presets.ts`·`lib/auth/server-guards.ts`·
 * `lib/auth/api-session-require.ts`·`lib/auth/member-account-state.ts`·`lib/auth/store-member-policy.ts`·
 * `lib/utils/ph-mobile.ts`·`lib/env/*`)가 `error` 에 넣는 코드를 모두 담는다.
 * 화면은 도메인 표와 합쳐 쓴다: `resolveApiErrorText({ json, status, map: { ...COMMON_API_ERROR_CODE_MAP, ...domainMap }, … })`.
 */
import type { ApiErrorCodeMap } from "@/lib/i18n/api-error-text";

/** `enforceRateLimit` 429 코드(프리셋 `code` 값) — 모두 같은 문구 */
const RATE_LIMIT_CODES = [
  "rate_limited",
  "ad_event_rate_limited",
  "chat_create_rate_limited",
  "chat_send_rate_limited",
  "delivery_ad_click_rate_limited",
  "delivery_eta_rate_limited",
  "device_register_rate_limited",
  "favorite_rate_limited",
  "gift_certificate_eligible_friends_rate_limited",
  "legal_consent_rate_limited",
  "password_login_resolve_rate_limited",
  "phone_verification_check_rate_limited",
  "phone_verification_rate_limited",
  "phone_verification_send_rate_limited",
  "profile_ensure_rate_limited",
  "push_subscribe_rate_limited",
  "report_rate_limited",
  "rider_location_rate_limited",
  "store_order_create_rate_limited",
  "store_review_rate_limited",
  "test_send_rate_limited",
  "trade_chat_new_room_rate_limited",
  "upload_rate_limited",
  "webhook_rate_limited",
] as const;

export const COMMON_API_ERROR_CODE_MAP: ApiErrorCodeMap = {
  unauthorized: "common_login_required",
  login_required: "common_login_required",
  profile_not_found: "api_err_profile_not_found",
  supabase_unconfigured: "net_dibay_error",
  internal_error: "net_dibay_error",
  temporarily_unavailable: "net_dibay_error",
  env_missing: "net_dibay_error",
  sms_send_failed: "api_err_sms_send_failed",
  member_activity_restricted: "api_err_member_activity_restricted",
  phone_verification_required: "auth_phone_gate_requirement",
  profile_incomplete: "api_err_profile_incomplete",
  invalid_ph_phone: "phone_rule",
  ...Object.fromEntries(RATE_LIMIT_CODES.map((code) => [code, "common_api_too_many_requests" as const])),
};
