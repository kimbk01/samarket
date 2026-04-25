import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { resolveRouteHandlerUserIdFromSupabase } from "@/lib/auth/resolve-route-handler-user-id";
import { jsonError } from "@/lib/http/api-route";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

/**
 * 동일 HTTP 요청·동일 쿠키로 `getOptionalAuthenticatedUserId` 가 동시에 여러 번 호출될 때
 * JWT 해석(`getClaims`/`getUser`)·클라이언트 생성을 **한 번만** 수행하도록 합류.
 * 키: `Cookie` 헤더 SHA-256 — 서버 부하·중복 Auth 호출 감소.
 */
const AUTH_USER_ID_INFLIGHT = new Map<string, Promise<string | null>>();

function inflightKeyFromCookieHeader(cookieHeader: string): string {
  if (!cookieHeader) return "∅";
  return createHash("sha256").update(cookieHeader, "utf8").digest("hex");
}

/**
 * Supabase 세션(쿠키)에서 사용자 ID.
 * 요청 본문/쿼리의 userId는 신뢰하지 않음.
 * JWT 식별은 `resolveRouteHandlerUserIdFromSupabase` — `getClaims()` 로컬 검증 우선, 필요 시만 `getUser()`.
 */
export async function getOptionalAuthenticatedUserId(): Promise<string | null> {
  let cookieHeader = "";
  try {
    cookieHeader = (await headers()).get("cookie") ?? "";
  } catch {
    /* next/headers 미사용 컨텍스트 */
  }
  const key = inflightKeyFromCookieHeader(cookieHeader);

  const existing = AUTH_USER_ID_INFLIGHT.get(key);
  if (existing) return existing;

  let resolveFn!: (v: string | null) => void;
  const p = new Promise<string | null>((resolve) => {
    resolveFn = resolve;
  });
  AUTH_USER_ID_INFLIGHT.set(key, p);

  void (async () => {
    try {
      const supabase = await createSupabaseRouteHandlerClient();
      if (!supabase) {
        resolveFn(null);
        return;
      }
      resolveFn(await resolveRouteHandlerUserIdFromSupabase(supabase));
    } catch {
      resolveFn(null);
    } finally {
      AUTH_USER_ID_INFLIGHT.delete(key);
    }
  })();

  return p;
}

/** @deprecated 기본 `getOptionalAuthenticatedUserId` 가 세션 우선. 레거시 import 호환용. */
export const getOptionalAuthenticatedUserIdPreferSession = getOptionalAuthenticatedUserId;

/** @deprecated 기본 `requireAuthenticatedUserId` 와 동일. 레거시 import 호환용. */
export async function requireAuthenticatedUserIdPreferSession(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  return requireAuthenticatedUserId();
}

export async function requireAuthenticatedUserId(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return {
      ok: false,
      response: jsonError("로그인이 필요합니다.", 401, { authenticated: false }),
    };
  }
  return { ok: true, userId };
}

/**
 * 결제·포인트·신고·차단·PII·통화 시그널 등 — JWT 서명 검증은 `getClaims`/`getUser` 체인과 동일.
 * (세션 쿠키 문자열만 파싱하는 경로는 쓰지 않음.)
 */
export async function getOptionalAuthenticatedUserIdStrict(): Promise<string | null> {
  return getOptionalAuthenticatedUserId();
}

export async function requireAuthenticatedUserIdStrict(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const userId = await getOptionalAuthenticatedUserIdStrict();
  if (!userId) {
    return {
      ok: false,
      response: jsonError("로그인이 필요합니다.", 401, { authenticated: false }),
    };
  }
  return { ok: true, userId };
}
