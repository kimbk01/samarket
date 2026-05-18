/**
 * GET /api/auth/session — (main) 앱 셸·SessionLostRedirect 와 동일하게 Supabase 세션만 인정.
 * Route Handler 에서 `cookies()` 만 쓰면 토큰 갱신 시 Set-Cookie 가 누락되어
 * 주기적 세션 체크가 401 로 보일 수 있어,
 * Request + mutable NextResponse 패턴으로 갱신 쿠키를 응답에 실음 (@supabase/ssr 권장).
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { cookieSecureFromNextRequest } from "@/lib/auth/cookie-secure-flag";
import { resolveRouteHandlerUserIdFromSupabase } from "@/lib/auth/resolve-route-handler-user-id";
import { readActiveSessionIdCookie } from "@/lib/auth/active-session";
import { validateActiveSessionLight } from "@/lib/auth/server-guards";
import { authSessionValidateDedupeKey, validateActiveSessionLightDeduped } from "@/lib/auth/auth-session-validate-dedupe";
import { jsonErrorWithRequest, jsonOkWithRequest } from "@/lib/http/api-route";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { logRoutePerf } from "@/lib/http/route-perf-log";
import { buildRoutePerfDedupeFields } from "@/lib/http/route-perf-dedupe-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function requestHasSupabaseAuthCookies(request: NextRequest): boolean {
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith("sb-") && (name.includes("auth-token") || name.includes("code-verifier"))) {
      return true;
    }
    if (name === "supabase.auth.token" || name.startsWith("supabase.auth.token.")) {
      return true;
    }
  }
  return false;
}

function mergeAuthCookies(from: NextResponse, to: NextResponse): void {
  for (const c of from.cookies.getAll()) {
    to.cookies.set(c);
  }
}

export async function GET(request: NextRequest) {
  const tRoute0 = devPerfNow();
  if (!requestHasSupabaseAuthCookies(request)) {
    return jsonErrorWithRequest(request, "로그인이 필요합니다.", 401, { authenticated: false });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    return jsonErrorWithRequest(request, "인증 설정이 준비되지 않았습니다.", 503, { authenticated: false });
  }

  let cookieCarrier = NextResponse.next({
    request: { headers: request.headers },
  });

  const cookieSecure = cookieSecureFromNextRequest(request);
  const supabase = createServerClient(url, anon, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: cookieSecure,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        cookieCarrier = NextResponse.next({
          request: { headers: request.headers },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieCarrier.cookies.set(name, value, options);
        });
      },
    },
  });

  /**
   * `getSession()` 뒤 `session.user` 를 쓰면 Supabase 가 **쿠키만 믿는 user** 경고를 낸다.
   * `getUser()` 를 매 요청 1순위로 쓰면 만료 직후 **서버 refresh** 가 브라우저 auto-refresh 와 경쟁할 수 있다.
   * → `getClaims()`(로컬 JWT) 우선·실패 시에만 `getUser()` — `resolveRouteHandlerUserIdFromSupabase`.
   */
  const auth0 = devPerfNow();
  const userId = (await resolveRouteHandlerUserIdFromSupabase(supabase))?.trim() ?? "";
  const authMs = devPerfNow() - auth0;
  if (!userId) {
    const res = jsonErrorWithRequest(request, "로그인이 필요합니다.", 401, { authenticated: false });
    mergeAuthCookies(cookieCarrier, res);
    return res;
  }

  const sessionFp = ((await readActiveSessionIdCookie()) ?? "").trim() || "∅";
  const requestDedupeKey = authSessionValidateDedupeKey(userId, sessionFp);

  let dbMs = 0;
  const validate0 = devPerfNow();
  const validated = await validateActiveSessionLightDeduped(userId, sessionFp);
  dbMs = devPerfNow() - validate0;
  if (!validated.ok) {
    mergeAuthCookies(cookieCarrier, validated.response);
    return validated.response;
  }

  const res = jsonOkWithRequest(request, { authenticated: true });
  mergeAuthCookies(cookieCarrier, res);
  const totalMs = Math.round(devPerfNow() - tRoute0);
  logRoutePerf({
    route: "/api/auth/session",
    total_ms: totalMs,
    db_ms: validated.ttlCacheHit ? 0 : Math.round(dbMs),
    cache_hit: validated.ttlCacheHit ? 1 : 0,
    auth_ms: Math.round(authMs),
    serialize_ms: 0,
    ...buildRoutePerfDedupeFields({
      userId,
      dedupeKey: requestDedupeKey,
      inFlightHit: validated.inFlightHit,
      responseCacheHit: false,
      ttlCacheHit: validated.ttlCacheHit,
      queryType: "active_session_light",
    }),
  });
  return res;
}
