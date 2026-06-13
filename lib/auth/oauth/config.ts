import type { OAuthProvider } from "@/lib/auth/auth-providers";

/** Capacitor Android/iOS OAuth 복귀 deep link (Supabase redirectTo) */
export const NATIVE_OAUTH_CALLBACK_URL = "dibay://auth/callback";

/** Supabase signInWithOAuth 대상 (네이버 제외) */
export const SUPABASE_OAUTH_PROVIDERS = ["google", "kakao", "apple"] as const;

export type SupabaseOAuthProvider = (typeof SUPABASE_OAUTH_PROVIDERS)[number];

export function isSupabaseOAuthProvider(value: string): value is SupabaseOAuthProvider {
  return (SUPABASE_OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/** Native Custom Tab 복귀 대기 — appUrlOpen 없을 때 pending 해제 */
export const OAUTH_PENDING_RETURN_TIMEOUT_NATIVE_MS = 60_000;

/** appUrlOpen 과 visibilitychange visible 경쟁 완화 */
export const OAUTH_FOREGROUND_CLEAR_DELAY_MS = 300;

export const OAUTH_START_API_PATH = "/api/auth/oauth/start";

export const KAKAO_OAUTH_SCOPE = "profile_nickname profile_image";

export function normalizeSupabaseOAuthProvider(value: unknown): SupabaseOAuthProvider | null {
  if (typeof value !== "string") return null;
  const provider = value.trim().toLowerCase();
  return isSupabaseOAuthProvider(provider) ? provider : null;
}

export function isNaverProvider(provider: OAuthProvider): boolean {
  return provider === "naver";
}
