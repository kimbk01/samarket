/**
 * 전화 OTP 인증 — 단일 계약 (서버·클라이언트·contract 검사 공통).
 *
 * INVARIANT:
 * - OTP 발송·검증·프로필 phone 갱신은 `phone-otp-service.ts` 만 수행한다.
 * - API route 는 인증·rate limit·display_name 보조·캐시 동기화만 한다.
 * - profiles.phone 은 항상 `09` + 9자리(DB09). challenge.phone·해시는 E.164.
 */

/** `createOtpCode()` — randomInt(100000, 1000000) → 항상 6자리 */
export const PHONE_OTP_CODE_LENGTH = 6;

export const PHONE_OTP_CODE_RE = /^\d{6}$/;

/** 서버 `verifyPhoneOtpForUser` 와 동일 — 6자리 숫자만 허용 */
export function isValidPhoneOtpCodeInput(code: string): boolean {
  return PHONE_OTP_CODE_RE.test(String(code ?? "").trim());
}

export type PhoneOtpVerifiedProfilePatch = {
  phone: string;
  phone_country_code: string | null;
  phone_number: string | null;
  phone_verified: true;
  phone_verified_at: string;
  phone_verification_status: "verified";
  member_status: "active";
  verified_member_at: string;
  status: "verified_user";
  phone_verification_method: "semaphore_local";
  phone_verification_attempt_count: 0;
  preferred_country: "PH";
  updated_at: string;
};

export type PhoneOtpPendingProfilePatch = {
  phone: string;
  phone_country_code: string | null;
  phone_number: string | null;
  phone_verified: false;
  phone_verified_at: null;
  phone_verification_status: "pending";
  phone_verification_method: "semaphore_local";
  phone_verification_requested_at: string;
  phone_verification_attempt_count: 0;
  preferred_country: "PH";
  updated_at: string;
};
