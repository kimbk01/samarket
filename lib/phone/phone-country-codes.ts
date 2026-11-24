/**
 * 전화 인증 국가번호 — 화면 「국가번호」 칸 단일 목록 (Owner 2026-11-09).
 *   +63 필리핀 = Semaphore · +82 한국 = Solapi. 그 외 나라 번호는 인증 불가.
 * 실제로 보여 줄 목록은 서버가 정한다(`country_dial_codes`, Solapi 설정 없으면 +82 제외).
 * 클라이언트 안전 — 서버 전용 모듈을 import 하지 않는다.
 */
export type PhoneCountryOption = {
  /** ISO 3166-1 alpha-2 */
  iso: "PH" | "KR";
  dialCode: "+63" | "+82";
  flag: string;
};

export const PHONE_VERIFY_COUNTRY_OPTIONS: readonly PhoneCountryOption[] = [
  { iso: "PH", dialCode: "+63", flag: "🇵🇭" },
  { iso: "KR", dialCode: "+82", flag: "🇰🇷" },
] as const;

export const PHONE_VERIFY_DEFAULT_COUNTRY: PhoneCountryOption = PHONE_VERIFY_COUNTRY_OPTIONS[0]!;

const KNOWN = new Set<string>(PHONE_VERIFY_COUNTRY_OPTIONS.map((c) => c.dialCode));

/** 서버 응답 `country_dial_codes` → 알려진 국가번호만. 비었거나 이상하면 `+63` 만. */
export function parseVerifyDialCodes(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string" && KNOWN.has(v)) : [];
  return list.length > 0 ? [...new Set(list)] : [PHONE_VERIFY_DEFAULT_COUNTRY.dialCode];
}

/**
 * 전화 인증 국가번호 기본값 — 접속 나라 기준 (Owner 2026-11-24 「필리핀 이면 +63 … 이외의 지역은 +82」).
 * `ipCountry` = 서버가 받은 접속 나라(ISO 2자리, Vercel `x-vercel-ip-country`). 저장된 번호가 있으면 화면이 그 나라를 먼저 쓴다.
 * - PH → +63 · 그 밖 나라 → +82 · 모름 → +63 · +82 를 보낼 수 없으면(서버 목록에 없음) +63.
 */
export function resolveDefaultVerifyDialCode(
  ipCountry: string | null | undefined,
  availableDialCodes: readonly string[] | null | undefined,
): "+63" | "+82" {
  const iso = String(ipCountry ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso) || iso === "PH") return "+63";
  return parseVerifyDialCodes(availableDialCodes ?? []).includes("+82") ? "+82" : "+63";
}

export function phoneVerifyCountryOptionsFor(dialCodes: readonly string[] | null | undefined): PhoneCountryOption[] {
  const allowed = new Set(parseVerifyDialCodes(dialCodes ?? []));
  return PHONE_VERIFY_COUNTRY_OPTIONS.filter((c) => allowed.has(c.dialCode));
}
