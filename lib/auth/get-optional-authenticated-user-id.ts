import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookieHeaderHasSupabaseAuthCookies } from "@/lib/auth/route-handler-auth-fast-guard";
import { resolveRouteHandlerAuthFromSupabase } from "@/lib/auth/resolve-route-handler-user-id";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { runSingleFlight } from "@/lib/http/run-single-flight";

/** `getOptionalRouteHandlerCookieAuth` / `getOptionalAuthenticatedUserId` 공통 합류 결과 */
export type RouteHandlerCookieAuth = {
  userId: string | null;
  user: User | null;
  claimsOnly: boolean;
  supabase: SupabaseClient | null;
};

function inflightKeyFromCookieHeader(cookieHeader: string): string {
  if (!cookieHeader) return "∅";
  return createHash("sha256").update(cookieHeader, "utf8").digest("hex");
}

function authCookieFlightKey(cookieHeader: string): string {
  return `route-handler-cookie-auth:${inflightKeyFromCookieHeader(cookieHeader)}`;
}

/**
 * Supabase 세션(쿠키)에서 사용자 ID.
 * 요청 본문/쿼리의 userId는 신뢰하지 않음.
 * JWT 식별은 `resolveRouteHandlerAuthFromSupabase` — `getClaims()` 로컬 검증 우선, 필요 시만 `getUser()`.
 *
 * `React.cache` — 동일 서버 요청 내 병렬 호출에서 한 번만 실행.
 */
async function resolveRouteHandlerCookieAuthOnce(): Promise<RouteHandlerCookieAuth> {
  let cookieHeader = "";
  try {
    cookieHeader = (await headers()).get("cookie") ?? "";
  } catch {
    /* next/headers 미사용 컨텍스트 */
  }
  return runSingleFlight(authCookieFlightKey(cookieHeader), async (): Promise<RouteHandlerCookieAuth> => {
    if (!cookieHeaderHasSupabaseAuthCookies(cookieHeader)) {
      return { userId: null, user: null, claimsOnly: false, supabase: null };
    }
    try {
      const supabase = await createSupabaseRouteHandlerClient();
      if (!supabase) {
        return { userId: null, user: null, claimsOnly: false, supabase: null };
      }
      const r = await resolveRouteHandlerAuthFromSupabase(supabase);
      return {
        userId: r.userId,
        user: r.user,
        claimsOnly: r.claimsOnly,
        supabase,
      };
    } catch {
      return { userId: null, user: null, claimsOnly: false, supabase: null };
    }
  });
}

export const getOptionalRouteHandlerCookieAuth = cache(resolveRouteHandlerCookieAuthOnce);

export async function getOptionalAuthenticatedUserId(): Promise<string | null> {
  const r = await getOptionalRouteHandlerCookieAuth();
  return r.userId;
}

/** @deprecated 기본 `getOptionalAuthenticatedUserId` 가 세션 우선. 레거시 import 호환용. */
export const getOptionalAuthenticatedUserIdPreferSession = getOptionalAuthenticatedUserId;

/**
 * 결제·포인트·신고·차단·PII·통화 시그널 등 — JWT 서명 검증은 `getClaims`/`getUser` 체인과 동일.
 * (세션 쿠키 문자열만 파싱하는 경로는 쓰지 않음.)
 */
export async function getOptionalAuthenticatedUserIdStrict(): Promise<string | null> {
  return getOptionalAuthenticatedUserId();
}
