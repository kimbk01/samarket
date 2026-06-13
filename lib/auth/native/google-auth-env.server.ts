/** Supabase Auth signInWithPassword 용 — email 병합·표시용 아님 */
export const GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN = "google.native.dibay.internal";

function readEnvList(raw: string | undefined): string[] {
  return String(raw ?? "")
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Native exchange session 생성 허용 — production 기본 활성. 명시 false 만 비활성화. */
export function isGoogleNativeExchangeSessionEnabled(): boolean {
  const flag = String(process.env.AUTH_GOOGLE_NATIVE_EXCHANGE_ENABLED ?? "").trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  return true;
}

/**
 * id_token JWT `aud` 허용 목록.
 * Android Google Sign-In 은 Web Client ID 로 id_token 을 발급한다.
 */
export function resolveGoogleNativeAllowedAudiences(): string[] {
  const explicit = readEnvList(process.env.AUTH_GOOGLE_NATIVE_AUDIENCES);
  const candidates = [
    ...explicit,
    process.env.AUTH_GOOGLE_NATIVE_WEB_CLIENT_ID?.trim(),
    process.env.GOOGLE_WEB_CLIENT_ID?.trim(),
    process.env.GOOGLE_CLIENT_ID?.trim(),
  ].filter(Boolean) as string[];

  return Array.from(new Set(candidates));
}

export function buildGoogleNativeAuthEmail(googleUserId: string): string {
  const normalized = String(googleUserId ?? "").trim().replace(/[^a-z0-9._-]/gi, "_");
  return `google.${normalized}@${GOOGLE_NATIVE_AUTH_EMAIL_DOMAIN}`;
}
