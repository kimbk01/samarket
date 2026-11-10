/**
 * 전화 인증 문자 발송 — 회원 인증(`phone-otp-service`)과 매장 전화 인증(`store-phone-otp-service`) 공용.
 * 나라 규칙(Owner 2026-11-09): 필리핀 +63 = Semaphore · 한국 +82 = Solapi(설정 있을 때만) · 그 외 거절.
 * 인증 기록 표는 여기서 다루지 않는다(각 서비스 파일만).
 */
import { resolveVerifyPhone, type ResolvedVerifyPhone } from "@/lib/phone/verify-phone-number";
import { isSolapiSmsConfigured } from "@/lib/env/solapi-sms";
import { sendSolapiSms } from "@/lib/auth/solapi-sms";
import { sendSemaphoreOtpSms } from "@/lib/auth/semaphore-sms";

/** 입력 번호 → 인증 대상. 한국은 Solapi 설정(키·발신번호)이 있을 때만 받는다. 그 외 나라는 null. */
export function resolveVerifyTarget(inputPhone: string): ResolvedVerifyPhone | null {
  const resolved = resolveVerifyPhone(inputPhone);
  if (!resolved) return null;
  if (resolved.country === "KR" && !isSolapiSmsConfigured()) return null;
  return resolved;
}

/** 발송 업체 분기 — 문자 문구는 나라별 (Solapi 한국 SMS 90byte 이내). */
export async function sendVerifySms(target: ResolvedVerifyPhone, otpCode: string) {
  if (target.country === "KR") {
    return sendSolapiSms(`0${target.storage.phone_number}`, `[DIBAY] Verification code: ${otpCode}`);
  }
  // 필리핀: Semaphore 인증번호 전용 경로(/otp) — 문구는 같고 번호 자리만 {otp} (2026-11-10)
  return sendSemaphoreOtpSms(target.e164, "[DIBAY] Verification code: {otp}", otpCode);
}
