import { NextResponse } from "next/server";
import { readKasamaDevUserIdFromRequest } from "@/lib/auth/kasama-session-cookies";
import { allowKasamaDevSession, isProductionDeploy } from "@/lib/config/deploy-surface";
import { jsonError } from "@/lib/http/api-route";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

/**
 * Supabase 세션(쿠키) 또는 아이디 로그인(test_users) 쿠키에서 사용자 ID.
 * 요청 본문/쿼리의 userId는 신뢰하지 않음.
 * Kasama: production 이 아니고 `allowKasamaDevSession()` 일 때만 인정 — `proxy.ts`·getRouteUserId 와 동일.
 */
export async function getOptionalAuthenticatedUserId(): Promise<string | null> {
  if (!isProductionDeploy() && allowKasamaDevSession()) {
    const kasama = await readKasamaDevUserIdFromRequest();
    if (kasama) return kasama;
  }

  const supabase = await createSupabaseRouteHandlerClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  }

  return null;
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
