import { NextResponse } from "next/server";
import { readKasamaDevUserIdFromRequest } from "@/lib/auth/kasama-session-cookies";
import { allowKasamaDevSession, isProductionDeploy } from "@/lib/config/deploy-surface";
import { jsonError } from "@/lib/http/api-route";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

/**
 * Supabase 세션(쿠키) 또는 아이디 로그인(test_users) 쿠키에서 사용자 ID.
 * 요청 본문/쿼리의 userId는 신뢰하지 않음.
 * Kasama: production 이 아니고 `allowKasamaDevSession()` 일 때만 인정 — `proxy.ts`·getRouteUserId 와 동일.
 *
 * 성능: `getSession()` 으로 쿠키 JWT 에서 user id 를 먼저 읽고, 없을 때만 `getUser()` 로 검증·갱신.
 * (매 요청 Auth 서버 왕복을 피하기 위함 — Route Handler 공통 기본값.)
 */
export async function getOptionalAuthenticatedUserId(): Promise<string | null> {
  if (!isProductionDeploy() && allowKasamaDevSession()) {
    const kasama = await readKasamaDevUserIdFromRequest();
    if (kasama) return kasama;
  }

  const supabase = await createSupabaseRouteHandlerClient();
  if (!supabase) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) return session.user.id;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!error && user?.id) return user.id;

  return null;
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
 * 결제·포인트·신고·차단·PII·통화 시그널 등 민감 처리용 — **항상 `getUser()`** 로 Auth 서버 JWT 검증.
 * (세션 쿠키만으로는 부족할 수 있는 남용·만료 직후 경합을 줄이기 위함. 일반 GET 목록은 `requireAuthenticatedUserId` 유지.)
 */
export async function getOptionalAuthenticatedUserIdStrict(): Promise<string | null> {
  if (!isProductionDeploy() && allowKasamaDevSession()) {
    const kasama = await readKasamaDevUserIdFromRequest();
    if (kasama) return kasama;
  }

  const supabase = await createSupabaseRouteHandlerClient();
  if (!supabase) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!error && user?.id) return user.id;

  return null;
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
