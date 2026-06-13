import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { withFreshLoginNextSearchParam } from "@/lib/auth/safe-next-path";
import {
  DIBAY_APP_MARKER_PARAM,
  readDibayAppPlatformMarker,
} from "@/lib/platform/capacitor-native";

export function buildNaverOAuthStartPath(next?: string | null): string {
  const base = withFreshLoginNextSearchParam("/api/auth/naver/start", next);
  const appPlatform = readDibayAppPlatformMarker();
  if (!appPlatform) return base;

  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${DIBAY_APP_MARKER_PARAM}=${encodeURIComponent(appPlatform)}`;
}

/** @deprecated Google/Kakao/Apple은 /api/auth/oauth/start 를 직접 사용 */
export function buildOAuthRedirectUrl(
  origin: string,
  provider: OAuthProvider,
  next?: string | null,
): string {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("provider", provider);
  if (next?.trim()) callback.searchParams.set("next", next.trim());
  return callback.toString();
}
