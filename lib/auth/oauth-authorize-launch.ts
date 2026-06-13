import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { waitForOAuthLaunchSurfaceAck } from "@/lib/auth/oauth-launch-surface";
import {
  logOAuthBrowserOpenFailed,
  logOAuthBrowserOpenStart,
  logOAuthBrowserOpenSuccess,
  logOAuthLaunchNavigation,
} from "@/lib/auth/oauth-flow-log";

type SupabaseOAuthProvider = Exclude<OAuthProvider, "naver">;

export type OAuthAuthorizeLaunchFailureReason =
  | "browser_plugin_unavailable"
  | "browser_open_rejected"
  | "browser_surface_not_opened"
  | "navigation_failed";

export type OAuthAuthorizeLaunchResult =
  | { ok: true }
  | { ok: false; reason: OAuthAuthorizeLaunchFailureReason };

/**
 * Google OAuth `disallowed_useragent` 는 WebView·SNS 인앱 브라우저 등
 * 임베디드 UA 에서 authorize URL 을 열 때 발생한다.
 */
export function isEmbeddedOAuthUserAgent(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
): boolean {
  if (!userAgent) return false;

  if (isCapacitorNativePlatform()) return true;

  if (typeof window !== "undefined" && (window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView) {
    return true;
  }

  if (/FBAN|FBAV|Instagram|Line\/|KAKAOTALK|Twitter|Snapchat|LinkedInApp|GSA\/|DuckDuckGo/i.test(userAgent)) {
    return true;
  }

  if (/; wv\)|\bWebView\b/i.test(userAgent)) return true;

  const iPadOs13Plus =
    typeof navigator !== "undefined" &&
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints > 1;
  const iosDevice = /iPad|iPhone|iPod/i.test(userAgent) || iPadOs13Plus;
  if (iosDevice && !/Safari|CriOS|FxiOS|EdgiOS/i.test(userAgent)) return true;

  return false;
}

/**
 * Web OAuth — top-level navigation (async Supabase 호출 후에도 popup blocker 영향 없음).
 */
export function launchWebOAuthNavigation(authorizeUrl: string): OAuthAuthorizeLaunchResult {
  const url = authorizeUrl.trim();
  if (!url || typeof window === "undefined") {
    return { ok: false, reason: "navigation_failed" };
  }

  try {
    logOAuthLaunchNavigation(url);
    window.location.assign(url);
    return { ok: true };
  } catch {
    return { ok: false, reason: "navigation_failed" };
  }
}

/**
 * @deprecated launchWebOAuthNavigation — async OAuth 후에도 동작하는 top-level navigation.
 */
export function launchGoogleOAuthAuthorizeUrl(url: string): OAuthAuthorizeLaunchResult {
  return launchWebOAuthNavigation(url);
}

async function launchNativeOAuthAuthorizeUrl(authorizeUrl: string): Promise<OAuthAuthorizeLaunchResult> {
  let Browser: typeof import("@capacitor/browser").Browser;
  try {
    ({ Browser } = await import("@capacitor/browser"));
  } catch {
    logOAuthBrowserOpenFailed("browser_plugin_unavailable");
    return { ok: false, reason: "browser_plugin_unavailable" };
  }

  logOAuthBrowserOpenStart(authorizeUrl);
  try {
    await Browser.open({ url: authorizeUrl });
    logOAuthBrowserOpenSuccess();
  } catch (err) {
    logOAuthBrowserOpenFailed("browser_open_rejected", err);
    return { ok: false, reason: "browser_open_rejected" };
  }

  const surfaceOpened = await waitForOAuthLaunchSurfaceAck();
  if (!surfaceOpened) {
    try {
      await Browser.close();
    } catch {
      // ignore — tab may never have opened
    }
    return { ok: false, reason: "browser_surface_not_opened" };
  }

  return { ok: true };
}

/**
 * Supabase OAuth authorize URL launch — provider·환경별 정책.
 * - native: Custom Tab (@capacitor/browser) + surface open 검증
 * - web: top-level navigation (window.open/popup 사용 안 함 — async 후 차단 방지)
 */
export async function launchOAuthAuthorizeUrl(
  provider: SupabaseOAuthProvider,
  url: string,
): Promise<OAuthAuthorizeLaunchResult> {
  const authorizeUrl = url.trim();
  if (!authorizeUrl || typeof window === "undefined") {
    return { ok: false, reason: "navigation_failed" };
  }

  if (isCapacitorNativePlatform()) {
    return launchNativeOAuthAuthorizeUrl(authorizeUrl);
  }

  if (provider === "google" || isEmbeddedOAuthUserAgent()) {
    return launchWebOAuthNavigation(authorizeUrl);
  }

  return launchWebOAuthNavigation(authorizeUrl);
}
