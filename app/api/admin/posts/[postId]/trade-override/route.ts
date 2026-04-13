import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

/**
 * 관리자: 게시물 강제 — 물품 판매 취소(숨김+예약해제) / 거래완료 표시
 * POST /api/admin/posts/[postId]/trade-override  body: { action: "cancel_sale" | "force_complete" }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "postId 필요" }, { status: 400 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!["cancel_sale", "force_complete"].includes(action)) {
    return NextResponse.json(
      { ok: false, error: "action은 cancel_sale 또는 force_complete 여야 합니다." },
      { status: 400 }
    );
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const now = new Date().toISOString();

  if (action === "cancel_sale") {
    const patch: Record<string, unknown> = {
      status: "hidden",
      visibility: "hidden",
      seller_listing_state: "inquiry",
      reserved_buyer_id: null,
      updated_at: now,
    };
    let { error } = await sb.from(POSTS_TABLE_WRITE).update(patch).eq("id", id);
    if (
      error &&
      /reserved_buyer_id|column/i.test(String(error.message)) &&
      /does not exist|unknown/i.test(String(error.message))
    ) {
      const rest = { ...patch };
      delete rest.reserved_buyer_id;
      error = (await sb.from(POSTS_TABLE_WRITE).update(rest).eq("id", id)).error;
    }
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    try {
      await sb
        .from("chat_rooms")
        .update({ trade_status: "inquiry", updated_at: now })
        .eq("room_type", "item_trade")
        .eq("item_id", id);
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: true });
  }

  const patchSold: Record<string, unknown> = {
    status: "sold",
    seller_listing_state: "completed",
    visibility: "public",
    updated_at: now,
  };
  const { error: e2 } = await sb.from(POSTS_TABLE_WRITE).update(patchSold).eq("id", id);
  if (e2) {
    return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });
  }
  try {
    await sb
      .from("chat_rooms")
      .update({ trade_status: "completed", updated_at: now })
      .eq("room_type", "item_trade")
      .eq("item_id", id);
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}
