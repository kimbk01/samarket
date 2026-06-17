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
import { authSessionValidateDedupeKey, validateActiveSessionLightDeduped } from "@/lib/auth/auth-session-validate-dedupe";
import { jsonErrorWithRequest, jsonOkWithRequest } from "@/lib/http/api-route";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { logRoutePerf } from "@/lib/http/route-perf-log";
import {
  buildRoutePerfClientObservability,
  buildRoutePerfDedupeFields,
} from "@/lib/http/route-perf-dedupe-fields";
import {
  AUTH_ROUTE_SUPABASE_SOFT_TIMEOUT_MS,
  buildAuthRouteSoftTimeoutResponse,
  buildMissingAuthCookie401Response,
  enforceAuthSessionRouteRateLimit,
  logAuthSessionRoute,
  requestHasSupabaseAuthCookies,
  withAuthRouteSoftTimeout,
} from "@/lib/auth/route-handler-auth-fast-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** P0 — Function 10s 대기 방지 */
export const maxDuration = 10;

type CookieToSet = { name: string; value: string; options: CookieOptions };

function mergeAuthCookies(from: NextResponse, to: NextResponse): void {
  for (const c of from.cookies.getAll()) {
    to.cookies.set(c);
  }
}

export async function GET(request: NextRequest) {
  const tRoute0 = devPerfNow();

  const rateLimit = await enforceAuthSessionRouteRateLimit(request);
  if (!rateLimit.ok) {
    logAuthSessionRoute("rate_limited", { duration_ms: Math.round(devPerfNow() - tRoute0) });
    return rateLimit.response;
  }

  if (!requestHasSupabaseAuthCookies(request)) {
    logAuthSessionRoute("missing_cookie_fast_401", { duration_ms: Math.round(devPerfNow() - tRoute0) });
    return buildMissingAuthCookie401Response();
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

  logAuthSessionRoute("supabase_start", {});
  const auth0 = devPerfNow();
  const userIdResult = await withAuthRouteSoftTimeout(
    resolveRouteHandlerUserIdFromSupabase(supabase),
    AUTH_ROUTE_SUPABASE_SOFT_TIMEOUT_MS,
    "resolve_user",
  );
  const authMs = devPerfNow() - auth0;

  if (!userIdResult.ok) {
    logAuthSessionRoute("soft_timeout", { phase: "resolve_user", duration_ms: Math.round(authMs) });
    return buildAuthRouteSoftTimeoutResponse("/api/auth/session", "resolve_user");
  }

  const userId = userIdResult.value?.trim() ?? "";
  logAuthSessionRoute("supabase_done", { phase: "resolve_user", duration_ms: Math.round(authMs), hasUser: Boolean(userId) });

  if (!userId) {
    const res = jsonErrorWithRequest(request, "로그인이 필요합니다.", 401, { authenticated: false });
    mergeAuthCookies(cookieCarrier, res);
    return res;
  }

  const sessionFp = ((await readActiveSessionIdCookie()) ?? "").trim() || "∅";
  const requestDedupeKey = authSessionValidateDedupeKey(userId, sessionFp);

  let dbMs = 0;
  const validate0 = devPerfNow();
  const validatedResult = await withAuthRouteSoftTimeout(
    validateActiveSessionLightDeduped(userId, sessionFp),
    AUTH_ROUTE_SUPABASE_SOFT_TIMEOUT_MS,
    "validate_active_session",
  );
  dbMs = devPerfNow() - validate0;

  if (!validatedResult.ok) {
    logAuthSessionRoute("soft_timeout", { phase: "validate_active_session", duration_ms: Math.round(dbMs) });
    return buildAuthRouteSoftTimeoutResponse("/api/auth/session", "validate_active_session");
  }

  const validated = validatedResult.value;
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
    ...buildRoutePerfClientObservability({ request, firstPaintBlocking: false }),
    ...buildRoutePerfDedupeFields({
      userId,
      dedupeKey: requestDedupeKey,
      inFlightHit: validated.inFlightHit,
      responseCacheHit: false,
      ttlCacheHit: validated.ttlCacheHit,
      queryType: "active_session_light",
      cacheHitReason: validated.ttlCacheHit ? "active_session_ok_ttl" : undefined,
      dedupeHitReason: validated.inFlightHit ? "validate_singleflight" : undefined,
    }),
  });
  return res;
}
