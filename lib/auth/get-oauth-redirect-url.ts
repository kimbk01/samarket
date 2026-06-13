import { NATIVE_OAUTH_CALLBACK_URL } from "@/lib/auth/capacitor-oauth-return";
import { withFreshLoginNextSearchParam } from "@/lib/auth/safe-next-path";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

/**
 * OAuth signInWithOAuth 의 `redirectTo` 를 만든다.
 * - 웹: 동일 출처의 `/auth/callback` (Supabase Site URL whitelist 와 일치).
 * - Capacitor 네이티브: `dibay://auth/callback` — 외부 브라우저 OAuth 후 앱 복귀.
 * - `next` 는 탭 루트만 callback 으로 전달(deep link 복원 금지).
 */
export function buildOAuthRedirectUrl(
  origin: string,
  next?: string | null
): string {
  const base = isCapacitorNativePlatform()
    ? NATIVE_OAUTH_CALLBACK_URL
    : `${origin.replace(/\/$/, "")}/auth/callback`;
  return withFreshLoginNextSearchParam(base, next);
}
