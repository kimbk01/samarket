import type { NextRequest } from "next/server";

export const DIBAY_APP_MARKER_PARAM = "dibay_app";
export const DIBAY_APP_MARKER_COOKIE_NAME = "dibay_app";

const NATIVE_APP_PLATFORMS = new Set(["android", "ios"]);

function normalizeNativeAppPlatform(value: string | null | undefined): "android" | "ios" | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return NATIVE_APP_PLATFORMS.has(normalized) ? (normalized as "android" | "ios") : null;
}

/**
 * Capacitor Android/iOS WebView OAuth start — dibay_app query 또는 cookie 로 native redirectTo 를 선택한다.
 * WebView navigation(302) 한 번으로 PKCE 쿠키·provider authorize URL 까지 이어진다.
 */
export function isNativeAppOAuthRequest(req: NextRequest): boolean {
  const fromQuery = normalizeNativeAppPlatform(req.nextUrl.searchParams.get(DIBAY_APP_MARKER_PARAM));
  if (fromQuery) return true;
  const fromCookie = normalizeNativeAppPlatform(req.cookies.get(DIBAY_APP_MARKER_COOKIE_NAME)?.value);
  return fromCookie != null;
}
