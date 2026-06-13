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
