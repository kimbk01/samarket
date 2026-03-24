/**
 * POST /api/posts/[postId]/owner-status
 * Body: { status: active | reserved | sold | hidden } — 판매자는 세션
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { SellerListingState } from "@/lib/products/seller-listing-state";

const ALLOWED = new Set(["active", "reserved", "sold", "hidden"]);

function listingStateForPostStatus(
  status: string
): SellerListingState | null {
  if (status === "sold") return "completed";
  if (status === "reserved") return "reserved";
  if (status === "active") return "inquiry";
  return null;
}

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
  if (!postId?.trim() || !ALLOWED.has(nextStatus)) {
    return NextResponse.json(
      { ok: false, error: "postId, status(active|reserved|sold|hidden) 필요" },
      { status: 400 }
    );
  }

  const sbAny = sb;
  const { data: post, error: postErr } = await sbAny
    .from("posts")
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
  const listing = listingStateForPostStatus(nextStatus);

  const postUpdate: Record<string, unknown> = {
    status: nextStatus,
    updated_at: now,
  };

  if (nextStatus === "hidden") {
    postUpdate.seller_listing_state = "inquiry";
    postUpdate.reserved_buyer_id = null;
  } else if (listing != null) {
    postUpdate.seller_listing_state = listing;
  }

  const db = sbAny as import("@supabase/supabase-js").SupabaseClient;

  let updErr = (await db.from("posts").update(postUpdate).eq("id", postId.trim())).error;
  if (
    updErr &&
    /reserved_buyer_id|column/i.test(String(updErr.message)) &&
    /does not exist|unknown/i.test(String(updErr.message))
  ) {
    const rest = { ...postUpdate };
    delete rest.reserved_buyer_id;
    updErr = (await db.from("posts").update(rest).eq("id", postId.trim())).error;
  }

  if (updErr) {
    return NextResponse.json(
      { ok: false, error: updErr.message ?? "저장 실패" },
      { status: 500 }
    );
  }

  const tradeListing =
    nextStatus === "hidden" ? "inquiry" : listing != null ? listing : null;
  if (tradeListing != null) {
    try {
      await db
        .from("chat_rooms")
        .update({ trade_status: tradeListing, updated_at: now })
        .eq("room_type", "item_trade")
        .eq("item_id", postId.trim());
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    sellerListingState: nextStatus === "hidden" ? "inquiry" : listing,
  });
}
