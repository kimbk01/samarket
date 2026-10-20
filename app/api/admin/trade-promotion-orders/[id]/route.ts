import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { mapPointPromotionOrderRow } from "@/lib/points/point-promotion-orders-db";
import { isPostEligibleForPromotionBoost } from "@/lib/promotion/trade-promotion-overlay";
import {
  runTradePromotionAction,
  TRADE_PROMOTION_ACTIONS,
  type TradePromotionAction,
} from "@/lib/admin/trade-admin/trade-promotion-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/trade-promotion-orders/[id] — service-role listing snapshot for review. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await ctx.params;
  const orderId = (id ?? "").trim();
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: row, error } = await sb
    .from("point_promotion_orders")
    .select("*")
    .eq("id", orderId)
    .eq("domain", "trade")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const order = mapPointPromotionOrderRow(row as Record<string, unknown>);
  const { data: post } = await sb
    .from("posts")
    .select("id, title, status, seller_listing_state, thumbnail_url, trade_category_id")
    .eq("id", order.targetId)
    .maybeSingle();
  const listing = post as Record<string, unknown> | null;
  const listingStatus = listing ? String(listing.status ?? "") : "missing";
  const listingEligible = listing
    ? isPostEligibleForPromotionBoost(
        listingStatus,
        listing.seller_listing_state
      )
    : false;

  return NextResponse.json({
    ok: true,
    order: {
      ...order,
      reviewReason:
        (row as { review_reason?: string | null }).review_reason != null
          ? String((row as { review_reason?: string | null }).review_reason)
          : null,
    },
    listing: listing
      ? {
          id: String(listing.id ?? ""),
          title: String(listing.title ?? ""),
          status: listingStatus,
          thumbnailUrl: listing.thumbnail_url != null ? String(listing.thumbnail_url) : null,
          tradeCategoryId: listing.trade_category_id != null ? String(listing.trade_category_id) : null,
          listingEligible,
        }
      : null,
  });
}

/**
 * PATCH /api/admin/trade-promotion-orders/[id]
 * body: { action: approve|reject|pause|resume|end, reason?, fault?: operator|member|none, reasonCode?, preview? }
 * 조치 1건 = 거래 홍보 DB 함수 1번 (상태·보류/확정/해제·환급·감사 한 트랜잭션, 설계 v2 §G-0). 권한: 활성 관리자 전원 (O-2).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await ctx.params;
  const orderId = (id ?? "").trim();
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
    fault?: string;
    reasonCode?: string;
    preview?: boolean;
  };
  const action = (body.action ?? "").trim();
  if (!(TRADE_PROMOTION_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }
  const meta = getAuditRequestMeta(req);
  const res = await runTradePromotionAction(admin.sb, {
    orderId,
    actorId: admin.userId,
    action: action as TradePromotionAction,
    reason: typeof body.reason === "string" ? body.reason.trim() || null : null,
    fault: body.fault === "operator" || body.fault === "member" || body.fault === "none" ? body.fault : null,
    reasonCode: body.reasonCode ?? null,
    preview: body.preview === true,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.httpStatus });
  return NextResponse.json({
    ok: true,
    orderStatus: res.data.order_status ?? null,
    endAt: res.data.end_at ?? null,
    refundPoints: res.data.refund_points ?? null,
    ...(res.data.preview === true ? { preview: res.data } : {}),
    ...(res.notifyWarning ? { sideEffectWarning: true } : {}),
  });
}
