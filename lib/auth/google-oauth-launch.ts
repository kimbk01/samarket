import type { SupabaseClient } from "@supabase/supabase-js";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { launchOAuthAuthorizeUrl } from "@/lib/auth/oauth-authorize-launch";
import {
  assertNativeAuthorizeRedirectToPresent,
  assertNativeOAuthRedirectExpected,
  detectRedirectToMismatch,
} from "@/lib/auth/oauth-redirect-contract";
import {
  extractRedirectToFromAuthorizeUrl,
  logOAuthAuthorizeUrl,
  logOAuthRedirectMismatch,
  logOAuthRedirectToMissing,
} from "@/lib/auth/oauth-flow-log";

export type OAuthSignInResult =
  | { ok: true; launched: true }
  | { ok: false; errorMessage: string; errorCode?: string };

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

/**
 * Supabase OAuth provider 공통 시작.
 * - 모든 provider 가 같은 redirectTo 계약(provider/next 포함)을 사용한다.
 * - native redirect 검증 FAIL 시 launch 중단.
 */
export async function startSupabaseOAuthSignIn(
  supabase: SupabaseClient,
  provider: SupabaseOAuthProvider,
  callbackUrl: string,
): Promise<OAuthSignInResult> {
  const nativeRedirectCheck = assertNativeOAuthRedirectExpected(callbackUrl);
  if (!nativeRedirectCheck.ok) {
    return {
      ok: false,
      errorMessage: "native_oauth_redirect_invalid",
      errorCode: nativeRedirectCheck.reason ?? "native_https_redirect",
    };
  }

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

  const extractedRedirectTo = extractRedirectToFromAuthorizeUrl(authorizeUrl);
  logOAuthAuthorizeUrl(authorizeUrl, provider);

  const redirectToPresent = assertNativeAuthorizeRedirectToPresent(extractedRedirectTo);
  if (!redirectToPresent.ok) {
    logOAuthRedirectToMissing(provider, authorizeUrl);
    return {
      ok: false,
      errorMessage: "oauth_redirect_missing",
      errorCode: redirectToPresent.reason ?? "redirect_to_missing",
    };
  }

  const mismatch = detectRedirectToMismatch(callbackUrl, extractedRedirectTo);
  if (mismatch.mismatch) {
    logOAuthRedirectMismatch(callbackUrl, extractedRedirectTo, mismatch.reason);
    return {
      ok: false,
      errorMessage: "oauth_redirect_mismatch",
      errorCode: mismatch.reason ?? "supabase_whitelist_fallback",
    };
  }

  const launchResult = await launchOAuthAuthorizeUrl(provider, authorizeUrl);
  if (!launchResult.ok) {
    return {
      ok: false,
      errorMessage: "oauth_launch_failed",
      errorCode: launchResult.reason,
    };
  }

  return { ok: true, launched: true };
}

export function startGoogleOAuthSignIn(
  supabase: SupabaseClient,
  callbackUrl: string,
): Promise<OAuthSignInResult> {
  return startSupabaseOAuthSignIn(supabase, "google", callbackUrl);
}

// Re-export for existing imports
export { isEmbeddedOAuthUserAgent, launchGoogleOAuthAuthorizeUrl } from "@/lib/auth/oauth-authorize-launch";
