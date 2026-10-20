import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { deleteTradeRecentViews, listTradeRecentViews } from "@/lib/mypage/trade-recent-views.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/recent-views — 내 최근 본 상품(M3, 최근 순 최대 100개). 조회 실패는 빈 목록이 아니라 오류 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "recent_views_unavailable" }, { status: 503 });

  const result = await listTradeRecentViews(sb, auth.userId);
  if (!result.ok) return NextResponse.json({ ok: false, error: "recent_views_load_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, items: result.items });
}

/** DELETE /api/me/recent-views[?postId=] — 한 건 또는 전체 삭제(본인 기록만) */
export async function DELETE(req: Request): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "recent_views_unavailable" }, { status: 503 });

  const postId = new URL(req.url).searchParams.get("postId");
  const ok = await deleteTradeRecentViews(sb, auth.userId, postId);
  if (!ok) return NextResponse.json({ ok: false, error: "recent_views_delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
