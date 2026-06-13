import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import {
  isNativeAppOAuthRequest,
  persistNativeAppMarkerCookie,
} from "@/lib/auth/oauth/resolve-native-oauth-request.server";
import {
  normalizeSupabaseOAuthProvider,
  runSupabaseOAuthStart,
} from "@/lib/auth/oauth/supabase-oauth-start.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function wantsNativeJsonResponse(req: NextRequest): boolean {
  const launch = req.nextUrl.searchParams.get("launch")?.trim().toLowerCase();
  return launch === "native";
}

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function jsonError(errorCode: string, message: string, status = 400): NextResponse {
  return withNoStore(NextResponse.json({ ok: false, errorCode, message }, { status }));
}

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie.name, cookie.value);
  }
  return to;
}

export async function GET(req: NextRequest) {
  const provider = normalizeSupabaseOAuthProvider(req.nextUrl.searchParams.get("provider"));
  const nativeApp = isNativeAppOAuthRequest(req);
  const wantsJson = wantsNativeJsonResponse(req);
  const safeNext = req.nextUrl.searchParams.get("next");

  if (!provider) {
    return jsonError("invalid_provider", "OAuth provider must be google, kakao, or apple.");
  }

  const cookieCarrier = NextResponse.json({ ok: true });
  persistNativeAppMarkerCookie(req, cookieCarrier);

  const result = await runSupabaseOAuthStart({
    provider,
    native: nativeApp,
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

  if (nativeApp && wantsJson) {
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
