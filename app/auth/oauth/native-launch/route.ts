import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
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

import {
  NATIVE_OAUTH_LAUNCH_OPEN_PATH,
  NATIVE_OAUTH_LAUNCH_URL_COOKIE,
} from "@/lib/auth/oauth/native-oauth-launch.constants";

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

export async function GET(req: NextRequest) {
  const provider = normalizeSupabaseOAuthProvider(readParam(req, "provider"));
  const next = readParam(req, "next");
  const native = isNativeAppLaunch(req);

  if (!provider) {
    return withNoStore(NextResponse.redirect(new URL("/login?error=invalid_provider", req.url)));
  }

  if (!native) {
    const query = new URLSearchParams({ provider });
    if (next) query.set("next", next);
    return withNoStore(NextResponse.redirect(new URL(`/api/auth/oauth/start?${query.toString()}`, req.url)));
  }

  const openUrl = new URL(NATIVE_OAUTH_LAUNCH_OPEN_PATH, req.url);
  const redirectResponse = NextResponse.redirect(openUrl);
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
          redirectResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  if (!result.ok) {
    return withNoStore(
      NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(result.errorCode)}`, req.url)),
    );
  }

  redirectResponse.cookies.set(NATIVE_OAUTH_LAUNCH_URL_COOKIE, result.authorizeUrl, {
    path: NATIVE_OAUTH_LAUNCH_OPEN_PATH,
    maxAge: 120,
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecureFromNextRequest(req),
  });

  return withNoStore(redirectResponse);
}
