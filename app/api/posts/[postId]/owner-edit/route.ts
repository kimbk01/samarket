/**
 * GET /api/posts/[postId]/owner-edit — 판매자 본인 trade 글 수정 폼용 스냅샷
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { ownerCannotEditDeleteReason } from "@/lib/posts/post-list-owner-menu";
import { fetchPostRowForOwnerEdit } from "@/lib/posts/owner-edit-select-post-row";

export const dynamic = "force-dynamic";

export async function GET(
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

  const { row: postRow, errorMessage } = await fetchPostRowForOwnerEdit(sb, id);

  if (errorMessage) {
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
  if (!postRow) {
    return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  const owner = typeof postRow.user_id === "string" ? postRow.user_id : "";
  if (owner !== userId) {
    return NextResponse.json({ ok: false, error: "본인 글만 수정할 수 있습니다." }, { status: 403 });
  }

  const block = ownerCannotEditDeleteReason({
    author_id: owner,
    status: postRow.status as string,
    seller_listing_state: postRow.seller_listing_state as string | undefined,
  });
  if (block) {
    return NextResponse.json({ ok: false, error: block, locked: true }, { status: 403 });
  }

  const tid =
    typeof postRow.trade_category_id === "string" ? postRow.trade_category_id.trim() : "";
  if (!tid) {
    return NextResponse.json({ ok: false, error: "카테고리 정보가 없습니다." }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    post: {
      id: postRow.id,
      trade_category_id: tid,
      title: (postRow.title as string) ?? "",
      content: (postRow.content as string) ?? "",
      price: postRow.price != null ? Number(postRow.price) : null,
      region: (postRow.region as string) ?? "",
      city: (postRow.city as string) ?? "",
      barangay: (postRow.barangay as string) ?? "",
      images: Array.isArray(postRow.images) ? (postRow.images as string[]) : [],
      meta: postRow.meta && typeof postRow.meta === "object" ? (postRow.meta as Record<string, unknown>) : null,
      is_free_share: postRow.is_free_share === true,
      is_price_offer: postRow.is_price_offer === true,
    },
  });
}
