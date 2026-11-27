/**
 * 전화 인증 문자 발송 — 회원 인증(`phone-otp-service`)과 매장 전화 인증(`store-phone-otp-service`) 공용.
 * 나라 규칙(Owner 2026-11-09): 필리핀 +63 = Semaphore · 한국 +82 = Solapi(설정 있을 때만) · 그 외 거절.
 * 인증 기록 표는 여기서 다루지 않는다(각 서비스 파일만).
 */
import { resolveVerifyPhone, type ResolvedVerifyPhone } from "@/lib/phone/verify-phone-number";
import { isSolapiSmsConfigured } from "@/lib/env/solapi-sms";
import { sendSolapiSms } from "@/lib/auth/solapi-sms";
import { sendSemaphoreSms } from "@/lib/auth/semaphore-sms";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import { resolveRequestAppLanguageOr } from "@/lib/i18n/request-app-language";

/** 입력 번호 → 인증 대상. 한국은 Solapi 설정(키·발신번호)이 있을 때만 받는다. 그 외 나라는 null. */
export function resolveVerifyTarget(inputPhone: string): ResolvedVerifyPhone | null {
  const resolved = resolveVerifyPhone(inputPhone);
  if (!resolved) return null;
  if (resolved.country === "KR" && !isSolapiSmsConfigured()) return null;
  return resolved;
}

/**
 * 인증 문자 본문 — 카탈로그 `auth_sms_verify_code` (재감사 2026-11-27 A2 · 「서버 문구는 요청 언어로」).
 * - 한국 번호(Solapi): 요청 화면 언어. ko 「[DIBAY] 인증번호: 123456」 = 24byte(EUC-KR) — SMS 90byte 이내.
 * - 필리핀 번호(Semaphore): 영어 고정 — 한글 문자 발송·요금(유니코드 길이) 미확인이라 기존 그대로 둔다(설계 §6 남은 위험).
 */
export function verifySmsBody(target: Pick<ResolvedVerifyPhone, "country">, otpCode: string, language: AppLanguageCode): string {
  const lang: AppLanguageCode = target.country === "KR" ? language : "en";
  return translate(lang, "auth_sms_verify_code", { otp: otpCode });
}

/** 발송 업체 분기 — 문자 문구는 나라·요청 언어별 (`verifySmsBody`). */
export async function sendVerifySms(target: ResolvedVerifyPhone, otpCode: string) {
  const language = await resolveRequestAppLanguageOr("en");
  const body = verifySmsBody(target, otpCode, language);
  if (target.country === "KR") {
    return sendSolapiSms(`0${target.storage.phone_number}`, body);
  }
  return sendSemaphoreSms(target.e164, body);
}
