/** Supabase Auth signInWithPassword 용 — email 병합·표시용 아님 */
export const KAKAO_NATIVE_AUTH_EMAIL_DOMAIN = "kakao.native.dibay.internal";

/** Kakao native exchange — production 기본 활성. 명시 false 만 비활성화. */
export function isKakaoNativeExchangeSessionEnabled(): boolean {
  const flag = String(process.env.AUTH_KAKAO_NATIVE_EXCHANGE_ENABLED ?? "").trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  return true;
}

export function buildKakaoNativeAuthEmail(kakaoUserId: string): string {
  const normalized = String(kakaoUserId ?? "").trim();
  return `kakao.${normalized}@${KAKAO_NATIVE_AUTH_EMAIL_DOMAIN}`;
}

/**
 * P1-2 — Kakao 앱 ID (`access_token_info.app_id` 비교용). 미설정·비정상 값이면 null.
 * Owner 가 Production env `KAKAO_APP_ID` 를 등록해야 검증이 강제된다.
 */
export function readKakaoAppIdEnv(): number | null {
  const raw = String(process.env.KAKAO_APP_ID ?? "").trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
