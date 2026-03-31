/**
 * GET /api/posts/[postId]/owner-edit — 판매자 본인 trade 글 수정 폼용 스냅샷
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { ownerCannotEditDeleteReason } from "@/lib/posts/post-list-owner-menu";

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

  const sbAny = sb;
  /** 일부 DB에는 posts.type 컬럼이 없음 — 거래 글은 trade_category_id 로 식별 */
  let sel =
    "id, user_id, trade_category_id, title, content, price, region, city, barangay, images, meta, is_free_share, is_price_offer, status, seller_listing_state, thumbnail_url";
  let { data: rawPost, error } = await sbAny.from("posts").select(sel).eq("id", id).maybeSingle();
  let postRow: Record<string, unknown> | null =
    rawPost && typeof rawPost === "object" && !("error" in rawPost && (rawPost as { error?: boolean }).error === true)
      ? (rawPost as Record<string, unknown>)
      : null;

  if (
    error &&
    /meta|is_free_share|is_price_offer|thumbnail_url|barangay|seller_listing_state/i.test(String(error.message)) &&
    /does not exist|unknown|schema cache|Could not find/i.test(String(error.message))
  ) {
    sel =
      "id, user_id, trade_category_id, title, content, price, region, city, images, status, seller_listing_state";
    const r2 = await sbAny.from("posts").select(sel).eq("id", id).maybeSingle();
    const d = r2.data;
    postRow =
      d && typeof d === "object" && !("error" in d && (d as { error?: boolean }).error === true)
        ? {
            ...(d as Record<string, unknown>),
            barangay: null,
            meta: null,
            is_free_share: false,
            is_price_offer: false,
            thumbnail_url: null,
          }
        : null;
    error = r2.error;
  }

  if (error) {
    const msg =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? error)
        : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  if (!postRow) {
    return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  const row = postRow;
  const owner = typeof row.user_id === "string" ? row.user_id : "";
  if (owner !== userId) {
    return NextResponse.json({ ok: false, error: "본인 글만 수정할 수 있습니다." }, { status: 403 });
  }

  const block = ownerCannotEditDeleteReason({
    author_id: owner,
    status: row.status as string,
    seller_listing_state: row.seller_listing_state as string | undefined,
  });
  if (block) {
    return NextResponse.json({ ok: false, error: block, locked: true }, { status: 403 });
  }

  const tid = typeof row.trade_category_id === "string" ? row.trade_category_id.trim() : "";
  if (!tid) {
    return NextResponse.json({ ok: false, error: "카테고리 정보가 없습니다." }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    post: {
      id: row.id,
      trade_category_id: tid,
      title: (row.title as string) ?? "",
      content: (row.content as string) ?? "",
      price: row.price != null ? Number(row.price) : null,
      region: (row.region as string) ?? "",
      city: (row.city as string) ?? "",
      barangay: (row.barangay as string) ?? "",
      images: Array.isArray(row.images) ? (row.images as string[]) : [],
      meta: row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : null,
      is_free_share: row.is_free_share === true,
      is_price_offer: row.is_price_offer === true,
    },
  });
}
