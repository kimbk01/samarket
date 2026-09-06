import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { mapPointPromotionOrderRow } from "@/lib/points/point-promotion-orders-db";
import { isPostEligibleForPromotionBoost } from "@/lib/promotion/trade-promotion-overlay";
import {
  approveTradePaidExposure,
  rejectTradePaidExposure,
} from "@/lib/promotion/apply-trade-paid-exposure";
import { applyBoostLifecycle } from "@/lib/promotion/admin-boost-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/trade-promotion-orders/[id] — service-role listing snapshot for review. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
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
 * body: { action: "approve" | "reject" | "pause" | "resume" | "end", reason?: string }
 * end = no auto Point refund (ADMIN_END_REFUND_POLICY_REQUIRED)
 * Server gate: requireAdminApiUser (not UI-only).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
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

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
  };
  const action = (body.action ?? "").trim();

  const { data: before } = await sb
    .from("point_promotion_orders")
    .select("id, domain, target_id, order_status, point_cost, review_reason")
    .eq("id", orderId)
    .eq("domain", "trade")
    .maybeSingle();
  const meta = getAuditRequestMeta(req);

  if (action === "approve") {
    const res = await approveTradePaidExposure(sb, {
      orderId,
      adminUserId: admin.userId,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: admin.userId,
      target_type: "trade_promotion_order",
      target_id: orderId,
      action: "trade_promotion_order.approve",
      before_json: before ? (before as Record<string, unknown>) : null,
      after_json: { action, order_status: "active", endAt: res.endAt },
      ip: meta.ip,
      user_agent: meta.userAgent,
    });
    return NextResponse.json({ ok: true, endAt: res.endAt });
  }

  if (action === "reject") {
    const res = await rejectTradePaidExposure(sb, {
      orderId,
      reason: body.reason ?? "",
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: admin.userId,
      target_type: "trade_promotion_order",
      target_id: orderId,
      action: "trade_promotion_order.reject",
      before_json: before ? (before as Record<string, unknown>) : null,
      after_json: { action, order_status: "rejected", reason: body.reason ?? "" },
      ip: meta.ip,
      user_agent: meta.userAgent,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "pause" || action === "resume" || action === "end") {
    const res = await applyBoostLifecycle(sb, {
      orderId,
      domain: "trade",
      action,
      adminUserId: admin.userId,
      reason: body.reason ?? null,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: res.httpStatus });
    }
    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: admin.userId,
      target_type: "trade_promotion_order",
      target_id: orderId,
      action: `trade_promotion_order.${action}`,
      before_json: before ? (before as Record<string, unknown>) : null,
      after_json: {
        action,
        order_status: res.orderStatus,
        endAt: res.endAt,
        refundPolicy: action === "end" ? "ADMIN_END_REFUND_POLICY_REQUIRED" : null,
      },
      ip: meta.ip,
      user_agent: meta.userAgent,
    });
    return NextResponse.json({
      ok: true,
      orderStatus: res.orderStatus,
      endAt: res.endAt,
      refundPolicy: action === "end" ? "ADMIN_END_REFUND_POLICY_REQUIRED" : undefined,
    });
  }

  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
