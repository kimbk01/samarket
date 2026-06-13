import { NATIVE_OAUTH_CALLBACK_URL } from "@/lib/auth/capacitor-oauth-return";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { withFreshLoginNextSearchParam } from "@/lib/auth/safe-next-path";
import {
  DIBAY_APP_MARKER_PARAM,
  isCapacitorNativePlatform,
  readDibayAppPlatformMarker,
} from "@/lib/platform/capacitor-native";

/**
 * OAuth signInWithOAuth 의 `redirectTo` 를 만든다.
 * - 웹: 동일 출처의 `/auth/callback` (Supabase Site URL whitelist 와 일치).
 * - Capacitor 네이티브: `dibay://auth/callback` — 외부 브라우저 OAuth 후 앱 복귀.
 * - `provider` 는 callback/bridge 가 provider별 후처리를 분기할 수 있게 항상 보존한다.
 * - `next` 는 탭 루트만 callback 으로 전달(deep link 복원 금지).
 */
export function buildOAuthRedirectUrl(
  origin: string,
  provider: OAuthProvider,
  next?: string | null
): string {
  const base = isCapacitorNativePlatform()
    ? NATIVE_OAUTH_CALLBACK_URL
    : `${origin.replace(/\/$/, "")}/auth/callback`;
  const withProvider = new URL(base);
  withProvider.searchParams.set("provider", provider);
  return withFreshLoginNextSearchParam(withProvider.toString(), next);
}

export function buildNaverOAuthStartPath(next?: string | null): string {
  const base = withFreshLoginNextSearchParam("/api/auth/naver/start", next);
  const appPlatform = readDibayAppPlatformMarker();
  if (!appPlatform) return base;

  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${DIBAY_APP_MARKER_PARAM}=${encodeURIComponent(appPlatform)}`;
}
