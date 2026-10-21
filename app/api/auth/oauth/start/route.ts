import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveAuthProviderLoginGate } from "@/lib/auth/auth-provider-store";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import {
  isNativeAppOAuthRequest,
  isNativeOAuthJsonLaunch,
  persistNativeAppMarkerCookie,
  shouldUseNativeOAuthRedirect,
} from "@/lib/auth/oauth/resolve-native-oauth-request.server";
import {
  normalizeSupabaseOAuthProvider,
  runSupabaseOAuthStart,
} from "@/lib/auth/oauth/supabase-oauth-start.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function wantsNativeJsonResponse(req: NextRequest): boolean {
  return isNativeOAuthJsonLaunch(req);
}

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function jsonError(errorCode: string, message: string, status = 400): NextResponse {
  return withNoStore(NextResponse.json({ ok: false, errorCode, message }, { status }));
}

/** OA-15 — PKCE verifier 등 쿠키 옵션(maxAge·path·sameSite·secure·httpOnly) 보존 복사. */
function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}

export async function GET(req: NextRequest) {
  const provider = normalizeSupabaseOAuthProvider(req.nextUrl.searchParams.get("provider"));
  const nativeApp = isNativeAppOAuthRequest(req);
  const wantsJson = wantsNativeJsonResponse(req);
  const useNativeRedirect = shouldUseNativeOAuthRedirect(req);
  const safeNext = req.nextUrl.searchParams.get("next");

  if (!provider) {
    return jsonError("invalid_provider", "OAuth provider must be google, kakao, or apple.");
  }

  // OA-14 — 관리자 OFF 공급자는 버튼 숨김만이 아니라 서버에서 시작 자체를 거부.
  const gate = await resolveAuthProviderLoginGate(tryCreateSupabaseServiceClient(), provider);
  if (!gate.allowed) {
    return jsonError("provider_disabled", "This sign-in method is currently disabled.", 403);
  }

  const cookieCarrier = NextResponse.json({ ok: true });
  persistNativeAppMarkerCookie(req, cookieCarrier);

  const result = await runSupabaseOAuthStart({
    provider,
    native: useNativeRedirect,
    next: safeNext,
    secureCookies: cookieSecureFromNextRequest(req),
    cookieStore: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieCarrier.cookies.set(name, value, options);
        }
      },
    },
  });

  if (!result.ok) {
    return jsonError(result.errorCode, result.message, result.status);
  }

  if (wantsJson) {
    return withNoStore(copyCookies(
      cookieCarrier,
      NextResponse.json({
        ok: true,
        authorizeUrl: result.authorizeUrl,
        provider: result.provider,
        redirectTo: result.redirectTo,
      }),
    ));
  }

  if (nativeApp && !wantsJson) {
    return jsonError(
      "native_launch_requires_json",
      "Native app OAuth must use launch=native fetch before opening Custom Tab.",
      400,
    );
  }

  return withNoStore(copyCookies(cookieCarrier, NextResponse.redirect(result.authorizeUrl)));
}

export function OPTIONS() {
  return withNoStore(NextResponse.json({ ok: true }));
}
