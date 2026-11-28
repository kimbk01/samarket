import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isBlockedByMe } from "@/lib/community-messenger/social-relations";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_AUTHOR_ID = "00000000-0000-4000-8000-000000000001";

/**
 * 내가 대상 회원과 맺은 관계 한 번에 — `{ ok, following, blocked }`.
 * 예전에는 화면이 관심이웃 GET·차단 GET 두 요청을 보냈다(설계 v2 §5-2 · B3). 인증·세션 확인은 예전 차단 GET 과 같은 경로.
 * 관심이웃 조회 오류는 성공(false)으로 바꾸지 않고 503(D3).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;

  const target = req.nextUrl.searchParams.get("targetUserId")?.trim() ?? "";
  if (process.env.NODE_ENV !== "production" && target === SAMPLE_AUTHOR_ID) {
    const state = (globalThis as {
      __samarketNeighborhoodDevSampleState?: {
        relations?: Map<string, { follows: Set<string>; blocks: Set<string> }>;
      };
    }).__samarketNeighborhoodDevSampleState;
    const rel = state?.relations?.get(auth.userId);
    return NextResponse.json({
      ok: true,
      following: rel?.follows?.has(target) === true,
      blocked: rel?.blocks?.has(target) === true,
      fallback: "dev_samples",
    });
  }
  if (!target || target === auth.userId || !isUuidLikeString(target)) {
    return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const [follow, blocked] = await Promise.all([
    sb
      .from("user_relationships")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("target_user_id", target)
      .eq("type", "neighbor_follow")
      .maybeSingle(),
    isBlockedByMe(auth.userId, target),
  ]);
  if (follow.error) {
    console.error("[community/user-relation GET] follow read failed", follow.error.message);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, following: Boolean(follow.data), blocked });
}
