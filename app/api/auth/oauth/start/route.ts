import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { isNativeAppOAuthRequest } from "@/lib/auth/oauth/resolve-native-oauth-request.server";
import {
  normalizeSupabaseOAuthProvider,
  runSupabaseOAuthStart,
} from "@/lib/auth/oauth/supabase-oauth-start.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const native = isNativeAppOAuthRequest(req);
  const safeNext = req.nextUrl.searchParams.get("next");

  if (!provider) {
    return jsonError("invalid_provider", "OAuth provider must be google, kakao, or apple.");
  }

  const cookieCarrier = NextResponse.json({ ok: true });
  const result = await runSupabaseOAuthStart({
    provider,
    native,
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

  return withNoStore(copyCookies(cookieCarrier, NextResponse.redirect(result.authorizeUrl)));
}

export function OPTIONS() {
  return withNoStore(NextResponse.json({ ok: true }));
}
