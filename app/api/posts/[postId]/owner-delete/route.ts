/**
 * POST /api/posts/[postId]/owner-delete — 판매자 본인만, 예약 전 단계 글 삭제(soft)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { ownerCannotEditDeleteReason } from "@/lib/posts/post-list-owner-menu";

export const dynamic = "force-dynamic";

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
    .from("posts")
    .select("id, user_id, status, seller_listing_state")
    .eq("id", id)
    .maybeSingle();

  if (
    postErr &&
    /seller_listing_state/i.test(String(postErr.message)) &&
    /does not exist|unknown|schema cache|Could not find/i.test(String(postErr.message))
  ) {
    const r2 = await sbAny.from("posts").select("id, user_id, status").eq("id", id).maybeSingle();
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

  const block = ownerCannotEditDeleteReason({
    author_id: ownerId,
    status: row.status as string,
    seller_listing_state: row.seller_listing_state as string | undefined,
  });
  if (block) {
    return NextResponse.json({ ok: false, error: block }, { status: 403 });
  }

  const now = new Date().toISOString();
  const db = sbAny as import("@supabase/supabase-js").SupabaseClient;

  const patch: Record<string, unknown> = {
    status: "deleted",
    updated_at: now,
  };

  let updErr = (await db.from("posts").update(patch).eq("id", id)).error;
  if (updErr && /deleted|check constraint|violates/i.test(String(updErr.message))) {
    updErr = (
      await db
        .from("posts")
        .update({ status: "hidden", updated_at: now })
        .eq("id", id)
    ).error;
  }

  if (updErr) {
    return NextResponse.json(
      { ok: false, error: updErr.message ?? "삭제에 실패했습니다." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
