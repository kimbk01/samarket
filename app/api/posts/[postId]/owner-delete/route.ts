import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/posts/[postId]/owner-delete — 판매자 본인만, 예약 전 단계 글 삭제(soft)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { allowSoftDelete, deriveTradeLifecycleStatus } from "@/lib/trade/trade-lifecycle-policy";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }

  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "postId 필요" }, { status: 400 });
  }

  const sbAny = sb;
  let { data: post, error: postErr } = await sbAny
    .from(POSTS_TABLE_READ)
    .select("id, user_id, status, seller_listing_state, meta")
    .eq("id", id)
    .maybeSingle();

  if (
    postErr &&
    /seller_listing_state/i.test(String(postErr.message)) &&
    /does not exist|unknown|schema cache|Could not find/i.test(String(postErr.message))
  ) {
    const r2 = await sbAny.from(POSTS_TABLE_READ).select("id, user_id, status, meta").eq("id", id).maybeSingle();
    post = r2.data
      ? ({ ...r2.data, seller_listing_state: null } as typeof post)
      : null;
    postErr = r2.error;
  }

  if (postErr) {
    return NextResponse.json(
      { ok: false, error: `글 조회 오류: ${postErr.message}` },
      { status: 500 }
    );
  }
  if (!post) {
    return NextResponse.json({ ok: false, error: "상품을 찾을 수 없습니다." }, { status: 404 });
  }

  const row = post as Record<string, unknown>;
  const ownerId = typeof row.user_id === "string" ? row.user_id : "";
  if (!ownerId || ownerId !== userId) {
    return NextResponse.json({ ok: false, error: "본인 글만 삭제할 수 있습니다." }, { status: 403 });
  }

  const lifecycle = deriveTradeLifecycleStatus({
    status: row.status as string,
    seller_listing_state: row.seller_listing_state as string | undefined,
    meta: row.meta as Record<string, unknown> | null | undefined,
  });
  if (!allowSoftDelete(lifecycle)) {
    return NextResponse.json(
      {
        ok: false,
        error: "이 상태에서는 삭제할 수 없습니다. 숨김 처리를 이용해 주세요.",
        code: "delete_not_allowed",
      },
      { status: 403 }
    );
  }

  // 판매자 삭제 = 판매자 노출(owner_state)만 바꾼다 (설계 v2 §F-1-1). status 는 트리거가 hidden 으로 계산.
  // 판매 단계·구매자 값은 그대로 보존한다.
  const now = new Date().toISOString();
  const db = sbAny as import("@supabase/supabase-js").SupabaseClient;
  const { error: updErr } = await db
    .from(POSTS_TABLE_WRITE)
    .update({ owner_state: "owner_deleted", updated_at: now })
    .eq("id", id);

  if (updErr) {
    return NextResponse.json(
      { ok: false, error: updErr.message ?? "삭제에 실패했습니다." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
