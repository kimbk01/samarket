import { headers, cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readActiveSessionIdCookie } from "@/lib/auth/active-session";
import {
  apiRouteAuthCookieFingerprint,
  apiRouteAuthCookieFingerprintFromPairs,
} from "@/lib/auth/api-route-auth-cookie-fingerprint";import {
  peekApiRouteAuthWarmCache,
  runApiRouteAuthResolveSingleFlight,
  setApiRouteAuthWarmCache,
  type ApiRouteAuthWarmSource,
} from "@/lib/auth/api-route-auth-warm-cache";
import { peekAuthSessionValidateCached } from "@/lib/auth/auth-session-validate-cache";
import { validateActiveSessionLightDeduped } from "@/lib/auth/auth-session-validate-dedupe";
import { resolveRouteHandlerAuthFromSupabase } from "@/lib/auth/resolve-route-handler-user-id";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";

export type ApiRouteAuthGateSource = "warm_cache" | ApiRouteAuthWarmSource;

export type ApiRouteAuthGateOk = {
  ok: true;
  userId: string;
  auth_ms: number;
  auth_cache_hit: 0 | 1;
  auth_source: ApiRouteAuthGateSource;
  session_validate_cache_hit: 0 | 1;
};

export type ApiRouteAuthGateFail = {
  ok: false;
  response: NextResponse;
  auth_ms: number;
  auth_cache_hit: 0 | 1;
  auth_source: ApiRouteAuthGateSource | "none";
};

function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

/**
 * API Route Handler 공통 auth — proxy 와 동일 getClaims 우선 + auth 쿠키 지문 warm cache + session validate dedupe.
 * anonymous 는 cache 하지 않음. profile full fetch 없음.
 */
export async function ensureApiRouteAuthGate(): Promise<ApiRouteAuthGateOk | ApiRouteAuthGateFail> {
  const wall0 = devPerfNow();
  let authFp = "∅";
  try {
    authFp = apiRouteAuthCookieFingerprintFromPairs((await cookies()).getAll());
  } catch {
    /* cookies() 미사용 컨텍스트 */
  }
  if (authFp === "∅") {
    try {
      authFp = apiRouteAuthCookieFingerprint((await headers()).get("cookie") ?? "");
    } catch {
      /* next/headers 미사용 컨텍스트 */
    }
  }  const sessionFp = ((await readActiveSessionIdCookie()) ?? "").trim() || "∅";

  const warm = peekApiRouteAuthWarmCache(authFp);
  if (warm?.userId) {
    const sessionCached = peekAuthSessionValidateCached(warm.userId, sessionFp);
    if (sessionCached) {
      return {
        ok: true,
        userId: warm.userId,
        auth_ms: Math.round(devPerfNow() - wall0),
        auth_cache_hit: 1,
        auth_source: "warm_cache",
        session_validate_cache_hit: 1,
      };
    }
    const validated = await validateActiveSessionLightDeduped(warm.userId, sessionFp);
    const auth_ms = Math.round(devPerfNow() - wall0);
    if (!validated.ok) {
      return {
        ok: false,
        response: validated.response,
        auth_ms,
        auth_cache_hit: 1,
        auth_source: "warm_cache",
      };
    }
    return {
      ok: true,
      userId: warm.userId,
      auth_ms,
      auth_cache_hit: 1,
      auth_source: "warm_cache",
      session_validate_cache_hit: validated.ttlCacheHit ? 1 : 0,
    };
  }

  const resolved = await runApiRouteAuthResolveSingleFlight(authFp, async () => {
    const again = peekApiRouteAuthWarmCache(authFp);
    if (again?.userId) return { userId: again.userId, authSource: again.authSource as ApiRouteAuthWarmSource, fromCache: true as const };

    const supabase = await createSupabaseRouteHandlerClient();
    if (!supabase) return { userId: null as string | null, authSource: "claims" as const, fromCache: false as const };

    const r = await resolveRouteHandlerAuthFromSupabase(supabase);
    const uid = r.userId?.trim() ?? "";
    if (!uid) return { userId: null, authSource: "claims" as const, fromCache: false as const };

    const authSource: ApiRouteAuthWarmSource = r.claimsOnly ? "claims" : "get_user";
    const email = r.user?.email?.trim() || null;
    setApiRouteAuthWarmCache(authFp, { userId: uid, email, claimsOnly: r.claimsOnly, authSource });
    return { userId: uid, authSource, fromCache: false as const };
  });

  const auth_ms_partial = Math.round(devPerfNow() - wall0);
  if (!resolved.userId) {
    return {
      ok: false,
      response: unauthorized(),
      auth_ms: auth_ms_partial,
      auth_cache_hit: 0,
      auth_source: "none",
    };
  }

  const sessionCachedBefore = peekAuthSessionValidateCached(resolved.userId, sessionFp);
  const validated = await validateActiveSessionLightDeduped(resolved.userId, sessionFp);
  const auth_ms = Math.round(devPerfNow() - wall0);
  const jwtCacheHit: 0 | 1 = resolved.fromCache ? 1 : 0;
  const sessionCacheHit: 0 | 1 = sessionCachedBefore || validated.ttlCacheHit ? 1 : 0;

  if (!validated.ok) {
    return {
      ok: false,
      response: validated.response,
      auth_ms,
      auth_cache_hit: jwtCacheHit || sessionCacheHit ? 1 : 0,
      auth_source: resolved.fromCache ? "warm_cache" : resolved.authSource,
    };
  }

  return {
    ok: true,
    userId: resolved.userId,
    auth_ms,
    auth_cache_hit: jwtCacheHit || sessionCacheHit ? 1 : 0,
    auth_source: resolved.fromCache ? "warm_cache" : resolved.authSource,
    session_validate_cache_hit: sessionCacheHit,
  };
}
