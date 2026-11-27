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

/** 네이티브 JSON 시작 실패 — 문장 대신 코드만(`message` 도 같은 코드 · 언어 재감사 2026-11-27). 화면은 errorCode → 키. */
function jsonError(errorCode: string, status = 400): NextResponse {
  return withNoStore(NextResponse.json({ ok: false, errorCode, message: errorCode }, { status }));
}

/**
 * 웹(브라우저 이동 `location.assign`) 시작 실패 — JSON 원문 페이지 대신 `/login?error=<code>` 로 보낸다.
 * 로그인 화면이 `mapAuthErrorMessage`(lib/auth/login-error-i18n.ts)로 코드 → 키. 거기서 아는 코드 이름으로 맞춘다.
 */
const WEB_LOGIN_ERROR_CODE: Readonly<Record<string, string>> = {
  provider_disabled: "provider_not_enabled",
  supabase_unconfigured: "supabase_service_unconfigured",
};

function safeLoginNext(raw: string | null): string | null {
  const v = String(raw ?? "").trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  return v;
}

function startError(req: NextRequest, browserNavigation: boolean, errorCode: string, status = 400): NextResponse {
  if (!browserNavigation) return jsonError(errorCode, status);
  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("error", WEB_LOGIN_ERROR_CODE[errorCode] ?? errorCode);
  const next = safeLoginNext(req.nextUrl.searchParams.get("next"));
  if (next) url.searchParams.set("next", next);
  return withNoStore(NextResponse.redirect(url, 302));
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
  /** 웹 브라우저 이동(네이티브 JSON 시작이 아님) — 실패 시 로그인 화면으로 보낸다 */
  const browserNavigation = !wantsJson && !nativeApp;

  if (!provider) {
    return startError(req, browserNavigation, "invalid_provider");
  }

  // OA-14 — 관리자 OFF 공급자는 버튼 숨김만이 아니라 서버에서 시작 자체를 거부.
  const gate = await resolveAuthProviderLoginGate(tryCreateSupabaseServiceClient(), provider);
  if (!gate.allowed) {
    return startError(req, browserNavigation, "provider_disabled", 403);
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
    return startError(req, browserNavigation, result.errorCode, result.status);
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
    return jsonError("native_launch_requires_json", 400);
  }

  return withNoStore(copyCookies(cookieCarrier, NextResponse.redirect(result.authorizeUrl)));
}

export function OPTIONS() {
  return withNoStore(NextResponse.json({ ok: true }));
}
