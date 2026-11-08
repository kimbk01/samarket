/**
 * 어드민 회원 목록·상세 — 전화번호 앞에 나라(🇵🇭 필리핀 / 🇰🇷 한국) 표시 (Owner 2026-11-09).
 */
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
import { detectStoredPhoneCountry, verifyPhoneCountryLabel } from "@/lib/phone/verify-phone-number";

export function adminPhoneWithCountry(
  phone: string | null | undefined,
  lang: "ko" | "en" = "ko",
  phoneCountryCode?: string | null,
): string {
  const raw = String(phone ?? "").trim();
  if (!raw) return "";
  const country = detectStoredPhoneCountry({ phone: raw, phone_country_code: phoneCountryCode ?? null });
  const formatted = formatProfilePhoneForDisplay({ phone: raw, phone_country_code: phoneCountryCode ?? null }) || raw;
  const label = verifyPhoneCountryLabel(country, lang);
  return label ? `${label} · ${formatted}` : formatted;
}
