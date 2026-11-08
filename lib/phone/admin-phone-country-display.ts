/**
 * 어드민 회원 목록·상세 — 전화번호 앞에 나라(🇵🇭 필리핀 / 🇰🇷 한국) 표시 (Owner 2026-11-09).
 * 나라 이름은 호출하는 화면이 카탈로그(`my_phone_country_name_*`)로 넘긴다.
 */
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
import {
  detectStoredPhoneCountry,
  VERIFY_PHONE_COUNTRY_FLAG,
  type VerifyPhoneCountry,
} from "@/lib/phone/verify-phone-number";

export function adminPhoneWithCountry(
  phone: string | null | undefined,
  countryName: (country: VerifyPhoneCountry) => string,
  phoneCountryCode?: string | null,
): string {
  const raw = String(phone ?? "").trim();
  if (!raw) return "";
  const country = detectStoredPhoneCountry({ phone: raw, phone_country_code: phoneCountryCode ?? null });
  const formatted = formatProfilePhoneForDisplay({ phone: raw, phone_country_code: phoneCountryCode ?? null }) || raw;
  return country ? `${VERIFY_PHONE_COUNTRY_FLAG[country]} ${countryName(country)} · ${formatted}` : formatted;
}

/** 발송 기록 provider_code → 나라 (solapi = 한국, 그 외 = 필리핀 Semaphore) */
export function phoneOtpProviderCountry(providerCode: string): VerifyPhoneCountry {
  return String(providerCode).startsWith("solapi") ? "KR" : "PH";
}
