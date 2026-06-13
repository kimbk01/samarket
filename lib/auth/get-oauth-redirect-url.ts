import { NATIVE_OAUTH_CALLBACK_URL } from "@/lib/auth/capacitor-oauth-return";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { withFreshLoginNextSearchParam } from "@/lib/auth/safe-next-path";
import {
  DIBAY_APP_MARKER_PARAM,
  isCapacitorNativePlatform,
  readDibayAppPlatformMarker,
} from "@/lib/platform/capacitor-native";

export type CreateOAuthRedirectToInput = {
  origin: string;
  provider: OAuthProvider;
  next?: string | null;
};

/**
 * OAuth signInWithOAuth 의 `redirectTo` 단일 진입점.
 * - 웹/PWA: `{origin}/auth/callback?provider=...`
 * - Capacitor Android/iOS: `dibay://auth/callback?provider=...`
 * - `provider` / `next` 파라미터는 callback·bridge 후처리용으로 항상 보존.
 */
export function createOAuthRedirectTo(input: CreateOAuthRedirectToInput): string {
  const { origin, provider, next } = input;
  const base = isCapacitorNativePlatform()
    ? NATIVE_OAUTH_CALLBACK_URL
    : `${origin.replace(/\/$/, "")}/auth/callback`;
  const withProvider = new URL(base);
  withProvider.searchParams.set("provider", provider);
  return withFreshLoginNextSearchParam(withProvider.toString(), next);
}

/** @deprecated createOAuthRedirectTo 사용 — 기존 호출부 호환 alias */
export function buildOAuthRedirectUrl(
  origin: string,
  provider: OAuthProvider,
  next?: string | null,
): string {
  return createOAuthRedirectTo({ origin, provider, next });
}

export function buildNaverOAuthStartPath(next?: string | null): string {
  const base = withFreshLoginNextSearchParam("/api/auth/naver/start", next);
  const appPlatform = readDibayAppPlatformMarker();
  if (!appPlatform) return base;

  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${DIBAY_APP_MARKER_PARAM}=${encodeURIComponent(appPlatform)}`;
}
