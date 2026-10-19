import { POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

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

  const { data: post, error: postErr } = await sb
    .from(POSTS_TABLE_WRITE)
    .select("id, user_id, status, seller_listing_state, moderation_state, owner_state")
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
  const row = post as {
    user_id?: string;
    seller_listing_state?: string | null;
    moderation_state?: string | null;
    owner_state?: string | null;
  };
  if (!row.user_id || row.user_id !== userId) {
    return NextResponse.json({ ok: false, error: "판매자만 변경할 수 있습니다." }, { status: 403 });
  }

  /**
   * 판매자 숨김·다시 보이기 = 판매자 노출(owner_state)만 바꾼다 (설계 v2 §F-1-1).
   * - 판매 단계·예약 구매자는 그대로 둔다 (숨겼다 다시 보여도 예약·거래완료 유지).
   * - 관리자 숨김·삭제는 판매자가 해제할 수 없다.
   * - O-8: 이관 전부터 숨김이던 글(legacy_hidden)은 지금처럼 판매자가 다시 보이게 할 수 있다.
   */
  const moderation = String(row.moderation_state ?? "visible");
  if (nextStatus === "active" && (moderation === "admin_hidden" || moderation === "admin_deleted")) {
    return NextResponse.json(
      {
        ok: false,
        error: "운영 정책에 따라 숨김 처리된 글입니다. 고객센터로 문의해 주세요.",
        code: "admin_hidden",
      },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();
  const postUpdate: Record<string, unknown> = { updated_at: now };
  if (nextStatus === "hidden") {
    postUpdate.owner_state = "owner_hidden";
  } else {
    postUpdate.owner_state = "none";
    if (moderation === "legacy_hidden") postUpdate.moderation_state = "visible";
  }

  const { data: updated, error: updErr } = await sb
    .from(POSTS_TABLE_WRITE)
    .update(postUpdate)
    .eq("id", postId.trim())
    .select("status, seller_listing_state")
    .maybeSingle();

  if (updErr) {
    return NextResponse.json(
      { ok: false, error: updErr.message ?? "저장 실패" },
      { status: 500 }
    );
  }

  const u = (updated ?? {}) as { status?: string; seller_listing_state?: string };
  return NextResponse.json({
    ok: true,
    status: u.status ?? nextStatus,
    sellerListingState: u.seller_listing_state ?? row.seller_listing_state ?? null,
  });
}
