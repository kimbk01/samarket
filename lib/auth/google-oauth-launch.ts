import type { SupabaseClient } from "@supabase/supabase-js";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { logOAuthAuthorizeUrl } from "@/lib/auth/oauth-flow-log";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

/**
 * Google OAuth `disallowed_useragent` 는 WebView·SNS 인앱 브라우저 등
 * 임베디드 UA 에서 authorize URL 을 열 때 발생한다.
 */
export function isEmbeddedOAuthUserAgent(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
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

export type OAuthSignInResult =
  | { ok: true; launched: true }
  | { ok: false; errorMessage: string };

type SupabaseOAuthProvider = Exclude<OAuthProvider, "naver">;

function buildOAuthProviderOptions(provider: SupabaseOAuthProvider): {
  queryParams?: Record<string, string>;
} {
  if (provider === "kakao") {
    return {
      // Supabase Kakao default scopes include account_email.
      // Force override with queryParams to avoid requesting email on non-business apps.
      queryParams: { scope: "profile_nickname profile_image" },
    };
  }
  return {};
}

function launchOAuthAuthorizeUrl(provider: SupabaseOAuthProvider, url: string): void {
  const authorizeUrl = url.trim();
  if (!authorizeUrl || typeof window === "undefined") return;

  if (provider === "google") {
    launchGoogleOAuthAuthorizeUrl(authorizeUrl);
    return;
  }

  window.location.assign(authorizeUrl);
}

/**
 * Supabase OAuth provider 공통 시작.
 * - 모든 provider 가 같은 redirectTo 계약(provider/next 포함)을 사용한다.
 * - Google 임베디드 UA 는 authorize URL 수신 후 외부 브라우저 탈출을 유지한다.
 */
export async function startSupabaseOAuthSignIn(
  supabase: SupabaseClient,
  provider: SupabaseOAuthProvider,
  callbackUrl: string,
): Promise<OAuthSignInResult> {
  const providerOptions = buildOAuthProviderOptions(provider);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl,
      skipBrowserRedirect: true,
      ...providerOptions,
    },
  });

  if (error) {
    return { ok: false, errorMessage: error.message };
  }

  const authorizeUrl = data?.url?.trim() ?? "";
  if (!authorizeUrl) {
    return { ok: false, errorMessage: "missing_authorize_url" };
  }
  logOAuthAuthorizeUrl(authorizeUrl);
  launchOAuthAuthorizeUrl(provider, authorizeUrl);

  return { ok: true, launched: true };
}

export function startGoogleOAuthSignIn(
  supabase: SupabaseClient,
  callbackUrl: string,
): Promise<OAuthSignInResult> {
  return startSupabaseOAuthSignIn(supabase, "google", callbackUrl);
}
