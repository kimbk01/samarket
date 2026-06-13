import { closeOAuthBrowserAfterReturn } from "@/lib/auth/close-oauth-browser";
import { markNativeOAuthCallbackExchangePending } from "@/lib/auth/native-oauth-callback-trace";
import { logAppUrlOpenEvent, logAppUrlOpenBridgeFailed } from "@/lib/auth/oauth-flow-log";

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

function readProviderFromNativeUrl(nativeUrl: string): string | null {
  try {
    const provider = new URL(nativeUrl.trim()).searchParams.get("provider")?.trim();
    return provider || null;
  } catch {
    return null;
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
 * 네이티브 OAuth deep link 를 수신하면 Custom Tab 닫기 시도 후 WebView HTTPS 콜백으로 이동.
 * @returns 처리했으면 true
 */
export async function handleCapacitorOAuthReturnUrl(nativeUrl: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const webCallbackUrl = buildWebOAuthCallbackUrlFromNativeReturn(
    nativeUrl,
    window.location.origin,
  );
  logAppUrlOpenEvent(nativeUrl, webCallbackUrl);
  if (!webCallbackUrl) {
    logAppUrlOpenBridgeFailed(nativeUrl);
    return false;
  }

  await closeOAuthBrowserAfterReturn();
  markNativeOAuthCallbackExchangePending(readProviderFromNativeUrl(nativeUrl));
  window.location.replace(webCallbackUrl);
  return true;
}
