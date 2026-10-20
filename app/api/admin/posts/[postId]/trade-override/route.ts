import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자: 게시물 강제 — 물품 판매 취소 / 거래완료(판매 확정 구매자 필수)
 * POST /api/admin/posts/[postId]/trade-override
 * body: { action: "cancel_sale" | "force_complete", buyerId?, reason? }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const admin = await requireTradeAdmin();
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
  const reason = normalizeCommunityAdminReason(body.reason);
  if (!reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }
  const buyerRequested =
    typeof body.buyerId === "string" && body.buyerId.trim() ? body.buyerId.trim() : null;

  const sb = admin.sb;
  const now = new Date().toISOString();

  if (action === "cancel_sale") {
    const { data: before } = await sb
      .from("posts")
      .select("status, seller_listing_state, sold_buyer_id, reserved_buyer_id, moderation_state")
      .eq("id", id)
      .maybeSingle();
    if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    // 판매 취소 = 판매 단계를 판매중으로 되돌리고 관리자 숨김 (노출은 moderation_state, status 는 트리거가 계산)
    const patch: Record<string, unknown> = {
      seller_listing_state: "inquiry",
      reserved_buyer_id: null,
      updated_at: now,
    };
    if ((before as { moderation_state?: string }).moderation_state === "visible") {
      patch.moderation_state = "admin_hidden";
      patch.moderation_reason = reason;
      patch.moderation_by = admin.userId;
    }
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
    const audit = await appendCommunityAdminAudit(sb, req, {
      actorId: admin.userId,
      targetType: "trade_post",
      targetId: id,
      action: "trade_post.cancel_sale",
      reason,
      before: before as Record<string, unknown>,
      after: { seller_listing_state: "inquiry", moderation_state: patch.moderation_state ?? (before as { moderation_state?: string }).moderation_state },
    });
    return NextResponse.json({ ok: true, ...(audit.ok ? {} : { auditWarning: true }) });
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

  // 판매자 완료 절차 없이 관리자가 완료로 정정 — 완료 시각(product_chats.seller_completed_at)은 만들지 않는다 (설계 v2 §E-4)
  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: admin.userId,
    targetType: "trade_post",
    targetId: id,
    action: "trade_post.force_complete",
    reason,
    before: (beforeSold as Record<string, unknown> | null) ?? null,
    after: { seller_listing_state: "completed", sold_buyer_id: soldBuyerId },
  });

  return NextResponse.json({ ok: true, soldBuyerId, ...(audit.ok ? {} : { auditWarning: true }) });
}
