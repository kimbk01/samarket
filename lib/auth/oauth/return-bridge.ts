import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { NATIVE_OAUTH_CALLBACK_URL } from "@/lib/auth/oauth/config";
import {
  logAppUrlOpenBridgeFailed,
  logAppUrlOpenBrowserClose,
  logAppUrlOpenEvent,
} from "@/lib/auth/oauth/log";

const NATIVE_OAUTH_CALLBACK_PREFIX = "dibay://auth/callback";

export { NATIVE_OAUTH_CALLBACK_URL };

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
 * `dibay://auth/callback?...` → WebView HTTPS `/auth/callback?...`
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

async function closeOAuthBrowserAfterReturn(): Promise<void> {
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
    logAppUrlOpenBrowserClose(true);
  } catch {
    logAppUrlOpenBrowserClose(false);
  }
}

function readProviderFromNativeUrl(nativeUrl: string): OAuthProvider | null {
  try {
    const provider = new URL(nativeUrl.trim()).searchParams.get("provider")?.trim().toLowerCase();
    if (
      provider === "google" ||
      provider === "kakao" ||
      provider === "apple" ||
      provider === "naver" ||
      provider === "facebook"
    ) {
      return provider;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 네이티브 OAuth deep link → Custom Tab 닫기 → WebView HTTPS 콜백 브릿지.
 */
export async function handleOAuthReturnUrl(nativeUrl: string): Promise<boolean> {
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
  const provider = readProviderFromNativeUrl(nativeUrl);
  if (provider) {
    logAuthCallbackBridgePending(provider);
  }
  window.location.replace(webCallbackUrl);
  return true;
}

function logAuthCallbackBridgePending(provider: OAuthProvider): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem("dibay_oauth_bridge_provider", provider);
  } catch {
    // ignore
  }
}

export function consumeOAuthBridgeProvider(): OAuthProvider | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem("dibay_oauth_bridge_provider")?.trim().toLowerCase();
    window.sessionStorage?.removeItem("dibay_oauth_bridge_provider");
    if (
      raw === "google" ||
      raw === "kakao" ||
      raw === "apple" ||
      raw === "naver" ||
      raw === "facebook"
    ) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}
