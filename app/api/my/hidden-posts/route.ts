export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/my/hidden-posts (세션) — F2: 내가 「이 글 숨기기」 한 거래 글 id (최근 1000건).
 * 다른 기기·앱 다시 열기에도 같은 글이 가려지게 서버(`trade_post_user_hides`)에서 읽는다.
 * 표가 아직 없으면(마이그레이션 전) 빈 목록 + `tableMissing` — 화면은 기기 메모리로 동작.
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";

const MAX_IDS = 1000;
const TABLE = "trade_post_user_hides";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  const { data, error } = await sb
    .from(TABLE)
    .select("post_id")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(MAX_IDS);
  if (error) {
    if (isMissingPointsTable(error.message ?? "", TABLE)) {
      return NextResponse.json(
        { ok: true, userId: auth.userId, postIds: [], tableMissing: true },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }
    return NextResponse.json({ ok: false, error: "hidden_posts_load_failed" }, { status: 500 });
  }
  const postIds = [
    ...new Set(
      ((data ?? []) as { post_id?: unknown }[])
        .map((r) => (typeof r.post_id === "string" ? r.post_id.trim() : ""))
        .filter(Boolean)
    ),
  ];
  return NextResponse.json({ ok: true, userId: auth.userId, postIds }, { headers: { "Cache-Control": "private, no-store" } });
}
