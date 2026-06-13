import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { buildOAuthRedirectTo } from "@/lib/auth/oauth/redirect-to";
import { withFreshLoginNextSearchParam } from "@/lib/auth/safe-next-path";
import {
  DIBAY_APP_MARKER_PARAM,
  readDibayAppPlatformMarker,
} from "@/lib/platform/capacitor-native";

/** @deprecated lib/auth/oauth/redirect-to — 네이버·레거시 호환 re-export */
export { buildOAuthRedirectTo, createOAuthRedirectTo } from "@/lib/auth/oauth/redirect-to";
export type { BuildOAuthRedirectToInput as CreateOAuthRedirectToInput } from "@/lib/auth/oauth/redirect-to";

export function buildNaverOAuthStartPath(next?: string | null): string {
  const base = withFreshLoginNextSearchParam("/api/auth/naver/start", next);
  const appPlatform = readDibayAppPlatformMarker();
  if (!appPlatform) return base;

  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${DIBAY_APP_MARKER_PARAM}=${encodeURIComponent(appPlatform)}`;
}

/** @deprecated buildOAuthRedirectTo 사용 */
export function buildOAuthRedirectUrl(
  origin: string,
  provider: OAuthProvider,
  next?: string | null,
): string {
  return buildOAuthRedirectTo({ isNative: false, origin, provider, next });
}
