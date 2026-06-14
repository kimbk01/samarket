/**
 * Apple Native identityToken aud 허용 목록 — 서버 env 단일 소스.
 *
 * Web OAuth Service ID(com.dibay.login2)와 Native Bundle ID(com.dibay.app)는 다를 수 있다.
 * @see docs/auth-provider-matrix.md
 */

export const APPLE_IDENTITY_TOKEN_ISSUER = "https://appleid.apple.com";
export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

/** Supabase Auth signInWithPassword 용 — email 병합·표시용 아님 */
export const APPLE_NATIVE_AUTH_EMAIL_DOMAIN = "apple.native.dibay.internal";

function readEnvList(raw: string | undefined): string[] {
  return String(raw ?? "")
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Native exchange session 생성 허용 — production 은 명시 true 권장 */
export function isAppleNativeExchangeSessionEnabled(): boolean {
  const flag = String(process.env.AUTH_APPLE_NATIVE_EXCHANGE_ENABLED ?? "").trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  if (flag === "true" || flag === "1" || flag === "on") return true;
  /** dev/staging: service role 있으면 기본 허용 (production 은 env true 필수) */
  return process.env.NODE_ENV !== "production";
}

/**
 * Native Apple SDK identityToken JWT `aud` 허용 목록.
 * Bundle ID(com.dibay.app)만 — Web OAuth Services ID(com.dibay.login2)는 포함하지 않는다.
 */
export function resolveAppleNativeAllowedAudiences(): string[] {
  const explicit = readEnvList(process.env.AUTH_APPLE_NATIVE_AUDIENCES);
  const candidates = [
    ...explicit,
    process.env.AUTH_APPLE_NATIVE_CLIENT_ID?.trim(),
    process.env.APPLE_NATIVE_BUNDLE_ID?.trim(),
  ].filter(Boolean) as string[];

  return Array.from(new Set(candidates));
}

export function isApplePrivateRelayEmail(email: string | null | undefined): boolean {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized.endsWith("@privaterelay.appleid.com");
}

/** Supabase Auth email — sub 기반 synthetic (email 병합 키 아님) */
export function buildAppleNativeAuthEmail(sub: string): string {
  const normalized = sub.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_");
  return `apple.${normalized}@${APPLE_NATIVE_AUTH_EMAIL_DOMAIN}`;
}
