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
