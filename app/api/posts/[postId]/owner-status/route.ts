import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/posts/[postId]/owner-status
 * Body: { status: active | hidden } — 판매자 세션
 *
 * Secondary HTTP entry for hide/relist only.
 * RESERVED / SOLD require buyer binding — use seller-listing-state / seller-complete.
 * Full listing transitions / reserved buyer / broadcast → seller-listing-state.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { buildPostsPatchFromOwnerStatus } from "@/lib/trade/posts-listing-write-fields";

/** Member-facing coarse status via this route — reserved/sold rejected (buyer binding). */
const ALLOWED = new Set(["active", "hidden"]);

export async function POST(
  req: NextRequest,
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
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const nextStatus = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
  if (!postId?.trim()) {
    return NextResponse.json({ ok: false, error: "postId 필요" }, { status: 400 });
  }
  if (nextStatus === "reserved") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "예약은 구매자를 지정하는 판매 단계 변경으로만 가능합니다. (seller-listing-state + reservedBuyerId)",
        code: "reserved_requires_buyer",
      },
      { status: 400 }
    );
  }
  if (nextStatus === "sold") {
    return NextResponse.json(
      {
        ok: false,
        error: "거래완료는 채팅의 판매완료(seller-complete)로만 처리할 수 있습니다.",
        code: "sold_requires_seller_complete",
      },
      { status: 400 }
    );
  }
  if (!ALLOWED.has(nextStatus)) {
    return NextResponse.json(
      { ok: false, error: "postId, status(active|hidden) 필요" },
      { status: 400 }
    );
  }

  const sbAny = sb;
  const { data: post, error: postErr } = await sbAny
    .from(POSTS_TABLE_READ)
    .select("id, user_id")
    .eq("id", postId.trim())
    .maybeSingle();

  if (postErr) {
    return NextResponse.json(
      { ok: false, error: `글 조회 오류: ${postErr.message}` },
      { status: 500 }
    );
  }
  if (!post) {
    return NextResponse.json({ ok: false, error: "상품을 찾을 수 없습니다." }, { status: 404 });
  }
  const row = post as { user_id?: string };
  if (!row.user_id || row.user_id !== userId) {
    return NextResponse.json({ ok: false, error: "판매자만 변경할 수 있습니다." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const postUpdate = buildPostsPatchFromOwnerStatus({
    postStatus: nextStatus as "active" | "hidden",
    nowIso: now,
  });

  const db = sbAny as import("@supabase/supabase-js").SupabaseClient;

  let updErr = (await db.from(POSTS_TABLE_WRITE).update(postUpdate).eq("id", postId.trim())).error;
  if (
    updErr &&
    /reserved_buyer_id|column/i.test(String(updErr.message)) &&
    /does not exist|unknown/i.test(String(updErr.message))
  ) {
    const rest = { ...postUpdate } as Record<string, unknown>;
    delete rest.reserved_buyer_id;
    updErr = (await db.from(POSTS_TABLE_WRITE).update(rest).eq("id", postId.trim())).error;
  }

  if (updErr) {
    return NextResponse.json(
      { ok: false, error: updErr.message ?? "저장 실패" },
      { status: 500 }
    );
  }

  const tradeListing = postUpdate.seller_listing_state;
  try {
    await db
      .from("chat_rooms")
      .update({ trade_status: tradeListing, updated_at: now })
      .eq("room_type", "item_trade")
      .eq("item_id", postId.trim());
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    sellerListingState: tradeListing,
  });
}
