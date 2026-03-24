import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { readKasamaDevUserIdFromRequest } from "@/lib/auth/kasama-session-cookies";

/**
 * Supabase 세션(쿠키) 또는 아이디 로그인(test_users) 쿠키에서 사용자 ID.
 * 요청 본문/쿼리의 userId는 신뢰하지 않음.
 */
export async function getOptionalAuthenticatedUserId(): Promise<string | null> {
  const kasama = await readKasamaDevUserIdFromRequest();
  if (kasama) return kasama;

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
      response: NextResponse.json(
        { ok: false, error: "로그인이 필요합니다." },
        { status: 401 }
      ),
    };
  }
  return { ok: true, userId };
}
