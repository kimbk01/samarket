import type { SupabaseClient } from "@supabase/supabase-js";

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
};

/**
 * Google OAuth `disallowed_useragent` 는 WebView·SNS 인앱 브라우저 등
 * 임베디드 UA 에서 authorize URL 을 열 때 발생한다.
 */
export function isEmbeddedOAuthUserAgent(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  if (!userAgent) return false;

  const capacitor = (typeof window !== "undefined"
    ? (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor
    : undefined) as CapacitorGlobal | undefined;
  if (capacitor?.isNativePlatform?.() === true) return true;

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
 * Google authorize URL 을 시스템·기본 브라우저로 탈출시키려 시도한다.
 * 실패 시에도 top-level navigation 으로 폴백한다.
 */
export function launchGoogleOAuthAuthorizeUrl(url: string): void {
  const authorizeUrl = url.trim();
  if (!authorizeUrl || typeof window === "undefined") return;

  if (isEmbeddedOAuthUserAgent()) {
    const anchor = document.createElement("a");
    anchor.href = authorizeUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    const opened = window.open(authorizeUrl, "_blank", "noopener,noreferrer");
    if (opened) return;
  }

  window.location.replace(authorizeUrl);
}

export type GoogleOAuthSignInResult =
  | { ok: true; launched: true }
  | { ok: false; errorMessage: string };

/**
 * Google provider 전용 Supabase OAuth 시작.
 * - 일반 브라우저: `skipBrowserRedirect` 없이 SDK top-level redirect
 * - 임베디드 UA: authorize URL 수신 후 외부 브라우저 탈출
 */
export async function startGoogleOAuthSignIn(
  supabase: SupabaseClient,
  callbackUrl: string,
): Promise<GoogleOAuthSignInResult> {
  const embedded = isEmbeddedOAuthUserAgent();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl,
      ...(embedded ? { skipBrowserRedirect: true } : {}),
    },
  });

  if (error) {
    return { ok: false, errorMessage: error.message };
  }

  if (embedded) {
    const authorizeUrl = data?.url?.trim() ?? "";
    if (!authorizeUrl) {
      return { ok: false, errorMessage: "missing_authorize_url" };
    }
    launchGoogleOAuthAuthorizeUrl(authorizeUrl);
    return { ok: true, launched: true };
  }

  return { ok: true, launched: true };
}
