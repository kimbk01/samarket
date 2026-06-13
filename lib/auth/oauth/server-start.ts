import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import {
  KAKAO_OAUTH_SCOPE,
  type SupabaseOAuthProvider,
} from "@/lib/auth/oauth/config";
import { buildOAuthRedirectTo } from "@/lib/auth/oauth/redirect-to";
import {
  assertNativeAuthorizeRedirectToPresent,
  assertNativeOAuthRedirectExpected,
  detectRedirectToMismatch,
} from "@/lib/auth/oauth/redirect-contract";
import {
  extractRedirectToFromAuthorizeUrl,
  logOAuthAuthorizeUrl,
  logOAuthRedirectMismatch,
  logOAuthRedirectToMissing,
  logOAuthStartRequest,
} from "@/lib/auth/oauth/log";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";

export type OAuthServerStartErrorCode =
  | "supabase_unconfigured"
  | "invalid_provider"
  | "native_oauth_redirect_invalid"
  | "oauth_redirect_missing"
  | "oauth_redirect_mismatch"
  | "missing_authorize_url"
  | "oauth_start_failed";

export type OAuthServerStartResult =
  | { ok: true; authorizeUrl: string; redirectTo: string; response: NextResponse }
  | { ok: false; errorCode: OAuthServerStartErrorCode; detail?: string };

function buildOAuthProviderOptions(provider: SupabaseOAuthProvider): {
  queryParams?: Record<string, string>;
} {
  if (provider === "kakao") {
    return {
      queryParams: { scope: KAKAO_OAUTH_SCOPE },
    };
  }
  return {};
}

function createOAuthSupabaseClient(req: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;

  const cookieSecure = cookieSecureFromNextRequest(req);
  return createServerClient(url, anon, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: cookieSecure,
    },
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[],
      ) {
        for (const { name, value, options } of cookiesToSet) {
          try {
            response.cookies.set(name, value, options);
          } catch {
            /* ignore malformed cookie options */
          }
        }
      },
    },
  });
}

export async function createSupabaseOAuthAuthorizeUrl(input: {
  req: NextRequest;
  provider: SupabaseOAuthProvider;
  next: string | null;
  isNative: boolean;
}): Promise<OAuthServerStartResult> {
  const { req, provider, next, isNative } = input;
  const safeNext = sanitizeNextPath(next);
  const origin = req.nextUrl.origin;
  const redirectTo = buildOAuthRedirectTo({
    isNative,
    origin,
    provider,
    next: safeNext,
  });

  logOAuthStartRequest(provider, redirectTo, isNative);

  const nativeRedirectCheck = assertNativeOAuthRedirectExpected(redirectTo, isNative);
  if (!nativeRedirectCheck.ok) {
    return {
      ok: false,
      errorCode: "native_oauth_redirect_invalid",
      detail: nativeRedirectCheck.reason ?? undefined,
    };
  }

  const cookieCarrier = NextResponse.json({ ok: true as const });
  const supabase = createOAuthSupabaseClient(req, cookieCarrier);
  if (!supabase) {
    return { ok: false, errorCode: "supabase_unconfigured" };
  }

  const providerOptions = buildOAuthProviderOptions(provider);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      ...providerOptions,
    },
  });

  if (error) {
    return { ok: false, errorCode: "oauth_start_failed", detail: error.message };
  }

  const authorizeUrl = data?.url?.trim() ?? "";
  if (!authorizeUrl) {
    return { ok: false, errorCode: "missing_authorize_url" };
  }

  const extractedRedirectTo = extractRedirectToFromAuthorizeUrl(authorizeUrl);
  logOAuthAuthorizeUrl(authorizeUrl, provider);

  const redirectToPresent = assertNativeAuthorizeRedirectToPresent(extractedRedirectTo, isNative);
  if (!redirectToPresent.ok) {
    logOAuthRedirectToMissing(provider, authorizeUrl);
    return {
      ok: false,
      errorCode: "oauth_redirect_missing",
      detail: redirectToPresent.reason ?? undefined,
    };
  }

  const mismatch = detectRedirectToMismatch(redirectTo, extractedRedirectTo);
  if (mismatch.mismatch) {
    logOAuthRedirectMismatch(redirectTo, extractedRedirectTo, mismatch.reason);
    return {
      ok: false,
      errorCode: "oauth_redirect_mismatch",
      detail: mismatch.reason ?? undefined,
    };
  }

  return {
    ok: true,
    authorizeUrl,
    redirectTo,
    response: cookieCarrier,
  };
}

function applyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie.name, cookie.value);
  }
  return to;
}

export function buildOAuthStartJsonResponse(
  authorizeUrl: string,
  cookieCarrier: NextResponse,
): NextResponse {
  const response = NextResponse.json({ ok: true, authorizeUrl });
  return applyCookies(cookieCarrier, response);
}

export function buildOAuthStartRedirectResponse(
  authorizeUrl: string,
  cookieCarrier: NextResponse,
): NextResponse {
  const response = NextResponse.redirect(authorizeUrl);
  return applyCookies(cookieCarrier, response);
}

export function buildOAuthStartLoginRedirect(
  req: NextRequest,
  authError: OAuthServerStartErrorCode,
  detail?: string,
  next?: string | null,
): NextResponse {
  const loginUrl = new URL("/login", req.url);
  const safeNext = sanitizeNextPath(next);
  if (safeNext) {
    loginUrl.searchParams.set("next", safeNext);
  }
  loginUrl.searchParams.set("auth_error", authError);
  if (detail?.trim()) {
    loginUrl.searchParams.set("auth_error_detail", detail.trim().slice(0, 300));
  }
  return NextResponse.redirect(loginUrl);
}
