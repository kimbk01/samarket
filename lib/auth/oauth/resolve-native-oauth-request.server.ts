import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

export const DIBAY_APP_MARKER_PARAM = "dibay_app";
export const DIBAY_APP_MARKER_COOKIE_NAME = "dibay_app";

const NATIVE_APP_PLATFORMS = new Set(["android", "ios"]);

export function normalizeNativeAppPlatform(value: string | null | undefined): "android" | "ios" | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return NATIVE_APP_PLATFORMS.has(normalized) ? (normalized as "android" | "ios") : null;
}

/**
 * Capacitor Android/iOS — dibay_app query 또는 cookie 로 redirectTo=dibay://auth/callback 을 선택한다.
 */
export function isNativeAppOAuthRequest(req: NextRequest): boolean {
  const fromQuery = normalizeNativeAppPlatform(req.nextUrl.searchParams.get(DIBAY_APP_MARKER_PARAM));
  if (fromQuery) return true;
  const fromCookie = normalizeNativeAppPlatform(req.cookies.get(DIBAY_APP_MARKER_COOKIE_NAME)?.value);
  return fromCookie != null;
}

export function persistNativeAppMarkerCookie(req: NextRequest, response: NextResponse): void {
  const platform = normalizeNativeAppPlatform(req.nextUrl.searchParams.get(DIBAY_APP_MARKER_PARAM));
  if (!platform) return;
  response.cookies.set(DIBAY_APP_MARKER_COOKIE_NAME, platform, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  });
}
