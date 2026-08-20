import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자: 게시물 강제 — 물품 판매 취소 / 거래완료(판매 확정 구매자 필수)
 * POST /api/admin/posts/[postId]/trade-override
 * body: { action: "cancel_sale" | "force_complete", buyerId?, reason? }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  let body: { action?: string; buyerId?: string; reason?: string | null };
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
  const reason =
    typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;
  const buyerRequested =
    typeof body.buyerId === "string" && body.buyerId.trim() ? body.buyerId.trim() : null;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const now = new Date().toISOString();

  if (action === "cancel_sale") {
    const { data: before } = await sb
      .from(POSTS_TABLE_READ)
      .select("status, visibility, sold_buyer_id, reserved_buyer_id")
      .eq("id", id)
      .maybeSingle();

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
    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: admin.userId,
      target_type: "post",
      target_id: id,
      action: "post.cancel_sale",
      before_json: before ?? null,
      after_json: { status: "hidden", reason },
    });
    return NextResponse.json({ ok: true });
  }

  const { data: beforeSold } = await sb
    .from(POSTS_TABLE_READ)
    .select("status, sold_buyer_id, reserved_buyer_id, title")
    .eq("id", id)
    .maybeSingle();

  let soldBuyerId = buyerRequested;
  if (soldBuyerId && !UUID_RE.test(soldBuyerId)) {
    return NextResponse.json({ ok: false, error: "buyerId는 UUID여야 합니다." }, { status: 400 });
  }
  if (!soldBuyerId) {
    const existing =
      typeof beforeSold?.sold_buyer_id === "string" && beforeSold.sold_buyer_id.trim()
        ? beforeSold.sold_buyer_id.trim()
        : typeof beforeSold?.reserved_buyer_id === "string" && beforeSold.reserved_buyer_id.trim()
          ? beforeSold.reserved_buyer_id.trim()
          : "";
    if (existing) soldBuyerId = existing;
  }
  if (!soldBuyerId) {
    const { data: chats } = await sb
      .from("product_chats")
      .select("buyer_id")
      .eq("post_id", id)
      .limit(50);
    const ids = [
      ...new Set(
        (Array.isArray(chats) ? chats : [])
          .map((r: { buyer_id?: string | null }) =>
            typeof r.buyer_id === "string" ? r.buyer_id.trim() : ""
          )
          .filter(Boolean)
      ),
    ];
    if (ids.length === 1) soldBuyerId = ids[0]!;
    else if (ids.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "판매 확정 구매자가 없습니다. buyerId를 지정하세요.",
          code: "need_sold_buyer",
        },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        {
          ok: false,
          error: `구매자 후보 ${ids.length}명 — buyerId 필요`,
          code: "need_sold_buyer",
          candidates: ids,
        },
        { status: 400 }
      );
    }
  }

  const patchSold: Record<string, unknown> = {
    status: "sold",
    seller_listing_state: "completed",
    visibility: "public",
    sold_buyer_id: soldBuyerId,
    reserved_buyer_id: null,
    updated_at: now,
  };
  let { error: e2 } = await sb.from(POSTS_TABLE_WRITE).update(patchSold).eq("id", id);
  if (e2 && /sold_buyer|reserved_buyer|seller_listing|column/i.test(String(e2.message))) {
    const rest = { ...patchSold };
    if (/sold_buyer/i.test(String(e2.message))) delete rest.sold_buyer_id;
    if (/reserved_buyer/i.test(String(e2.message))) delete rest.reserved_buyer_id;
    if (/seller_listing/i.test(String(e2.message))) delete rest.seller_listing_state;
    e2 = (await sb.from(POSTS_TABLE_WRITE).update(rest).eq("id", id)).error;
  }
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

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: admin.userId,
    target_type: "post",
    target_id: id,
    action: "post.force_complete",
    before_json: beforeSold ?? null,
    after_json: { status: "sold", sold_buyer_id: soldBuyerId, reason },
  });

  return NextResponse.json({ ok: true, soldBuyerId });
}
