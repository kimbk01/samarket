/** Capacitor Android/iOS OAuth 복귀 deep link (Supabase redirectTo) */
export const NATIVE_OAUTH_CALLBACK_URL = "dibay://auth/callback";

const NATIVE_OAUTH_CALLBACK_PREFIX = "dibay://auth/callback";

function isNativeOAuthCallbackUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === "dibay:" &&
      parsed.hostname === "auth" &&
      (parsed.pathname === "/callback" || parsed.pathname === "callback")
    );
  } catch {
    return trimmed.startsWith(NATIVE_OAUTH_CALLBACK_PREFIX);
  }
}

/**
 * `dibay://auth/callback?...` 를 WebView 내부 HTTPS `/auth/callback?...` 로 변환한다.
 * 기존 서버 콜백 route(세션·온보딩)를 그대로 재사용한다.
 */
export function buildWebOAuthCallbackUrlFromNativeReturn(
  nativeUrl: string,
  webOrigin: string,
): string | null {
  if (!isNativeOAuthCallbackUrl(nativeUrl)) return null;

  const origin = webOrigin.replace(/\/$/, "");
  if (!origin) return null;

  let params: URLSearchParams;
  try {
    params = new URL(nativeUrl.trim()).searchParams;
  } catch {
    const queryStart = nativeUrl.indexOf("?");
    params = new URLSearchParams(queryStart >= 0 ? nativeUrl.slice(queryStart + 1) : "");
  }

  const webCallback = new URL("/auth/callback", origin);
  for (const [key, value] of params.entries()) {
    webCallback.searchParams.set(key, value);
  }
  return webCallback.toString();
}

/**
 * 네이티브 OAuth deep link 를 수신하면 WebView 를 HTTPS 콜백으로 이동시킨다.
 * @returns 처리했으면 true
 */
export function handleCapacitorOAuthReturnUrl(nativeUrl: string): boolean {
  if (typeof window === "undefined") return false;

  const webCallbackUrl = buildWebOAuthCallbackUrlFromNativeReturn(
    nativeUrl,
    window.location.origin,
  );
  if (!webCallbackUrl) return false;

  window.location.replace(webCallbackUrl);
  return true;
}
