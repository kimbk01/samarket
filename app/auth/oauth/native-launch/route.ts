import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { buildNativeOAuthLaunchHtml } from "@/lib/auth/oauth/native-oauth-launch-html.server";
import { isNativeOAuthLaunchProvider } from "@/lib/auth/oauth/native-oauth-launch.constants";
import {
  normalizeSupabaseOAuthProvider,
  runSupabaseOAuthStart,
} from "@/lib/auth/oauth/supabase-oauth-start.server";
import {
  DIBAY_APP_MARKER_COOKIE_NAME,
  DIBAY_APP_MARKER_PARAM,
} from "@/lib/platform/capacitor-native";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readParam(req: NextRequest, key: string): string | null {
  return req.nextUrl.searchParams.get(key)?.trim() || null;
}

function isNativeAppLaunch(req: NextRequest): boolean {
  const marker = readParam(req, DIBAY_APP_MARKER_PARAM)?.toLowerCase();
  if (marker === "android" || marker === "ios") return true;
  const cookieMarker = req.cookies.get(DIBAY_APP_MARKER_COOKIE_NAME)?.value?.trim().toLowerCase();
  return cookieMarker === "android" || cookieMarker === "ios";
}

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie.name, cookie.value);
  }
  return to;
}

export async function GET(req: NextRequest) {
  const provider = normalizeSupabaseOAuthProvider(readParam(req, "provider"));
  const next = readParam(req, "next");
  const native = isNativeAppLaunch(req);

  if (!provider || !isNativeOAuthLaunchProvider(provider)) {
    return withNoStore(NextResponse.redirect(new URL("/login?error=invalid_provider", req.url)));
  }

  if (!native) {
    const query = new URLSearchParams({ provider });
    if (next) query.set("next", next);
    return withNoStore(NextResponse.redirect(new URL(`/api/auth/oauth/start?${query.toString()}`, req.url)));
  }

  const cookieCarrier = NextResponse.json({ ok: true });
  const result = await runSupabaseOAuthStart({
    provider,
    native: true,
    next,
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
    return withNoStore(
      NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(result.errorCode)}`, req.url)),
    );
  }

  return withNoStore(copyCookies(
    cookieCarrier,
    new NextResponse(buildNativeOAuthLaunchHtml({
      authorizeUrl: result.authorizeUrl,
      provider,
    }), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }),
  ));
}
