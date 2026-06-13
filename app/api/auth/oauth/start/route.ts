import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_OAUTH_PROVIDERS = new Set(["google", "kakao", "apple"]);
const NATIVE_CALLBACK_URL = "dibay://auth/callback";
const WEB_CALLBACK_ORIGIN = "https://samarket.vercel.app";
const KAKAO_SCOPE = "profile_nickname profile_image";

type SupabaseOAuthProvider = "google" | "kakao" | "apple";

function wantsNativeJsonResponse(req: NextRequest): boolean {
  const launch = req.nextUrl.searchParams.get("launch")?.trim().toLowerCase();
  if (launch === "native") return true;
  return false;
}

function normalizeProvider(value: string | null): SupabaseOAuthProvider | null {
  const provider = value?.trim().toLowerCase() ?? "";
  return SUPABASE_OAUTH_PROVIDERS.has(provider)
    ? (provider as SupabaseOAuthProvider)
    : null;
}

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function buildRedirectTo(
  provider: SupabaseOAuthProvider,
  native: boolean,
  next: string | null,
): string {
  const callback = native
    ? new URL(NATIVE_CALLBACK_URL)
    : new URL("/auth/callback", WEB_CALLBACK_ORIGIN);
  callback.searchParams.set("provider", provider);
  if (next) {
    callback.searchParams.set("next", next);
  }
  return callback.toString();
}

function kakaoProviderOptions(provider: SupabaseOAuthProvider) {
  return provider === "kakao" ? { queryParams: { scope: KAKAO_SCOPE } } : {};
}

function jsonError(errorCode: string, message: string, status = 400): NextResponse {
  return withNoStore(NextResponse.json({ ok: false, errorCode, message }, { status }));
}

function createOAuthSupabaseClient(req: NextRequest, response: NextResponse) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: cookieSecureFromNextRequest(req),
    },
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[],
      ) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
}

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie.name, cookie.value);
  }
  return to;
}

export async function GET(req: NextRequest) {
  const provider = normalizeProvider(req.nextUrl.searchParams.get("provider"));
  const native = wantsNativeJsonResponse(req);
  const safeNext = sanitizeNextPath(req.nextUrl.searchParams.get("next"));

  if (!provider) {
    return jsonError("invalid_provider", "OAuth provider must be google, kakao, or apple.");
  }

  const redirectTo = buildRedirectTo(provider, native, safeNext);
  const cookieCarrier = NextResponse.json({ ok: true });
  const supabase = createOAuthSupabaseClient(req, cookieCarrier);
  if (!supabase) {
    return jsonError("supabase_unconfigured", "Supabase OAuth is not configured.", 503);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      ...kakaoProviderOptions(provider),
    },
  });

  if (error) {
    return jsonError("oauth_start_failed", error.message || "OAuth start failed.");
  }

  const authorizeUrl = data?.url?.trim();
  if (!authorizeUrl) {
    return jsonError("missing_authorize_url", "Supabase did not return an authorize URL.");
  }

  if (native) {
    return withNoStore(copyCookies(
      cookieCarrier,
      NextResponse.json({ ok: true, authorizeUrl, provider, redirectTo }),
    ));
  }

  return withNoStore(copyCookies(cookieCarrier, NextResponse.redirect(authorizeUrl)));
}

export function OPTIONS() {
  return withNoStore(NextResponse.json({ ok: true }));
}
