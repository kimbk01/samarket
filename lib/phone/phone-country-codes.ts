/**
 * 전화 인증 국가번호 — 인증 화면의 「국가번호」 칸 단일 목록 (Owner 2026-11-09: 국가번호·번호 칸 분리).
 * 발송 업체가 지원하는 국가만 넣는다. 현재 Semaphore = 필리핀(+63)만. 한국(+82)은 발송 업체 결정 후 추가.
 */
export type PhoneCountryOption = {
  /** ISO 3166-1 alpha-2 */
  iso: "PH";
  dialCode: "+63";
  flag: string;
};

export const PHONE_VERIFY_COUNTRY_OPTIONS: readonly PhoneCountryOption[] = [
  { iso: "PH", dialCode: "+63", flag: "🇵🇭" },
] as const;

export const PHONE_VERIFY_DEFAULT_COUNTRY: PhoneCountryOption = PHONE_VERIFY_COUNTRY_OPTIONS[0]!;
