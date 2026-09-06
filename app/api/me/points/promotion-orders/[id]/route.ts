import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { cancelCommunityPaidExposure } from "@/lib/promotion/apply-community-paid-exposure";
import { releaseHeldPointsForPromotionOrder } from "@/lib/promotion/promotion-point-hold-flow";
import { readUserPointBalance } from "@/lib/points/user-point-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/me/points/promotion-orders/[id]
 * body: { action: "cancel" }
 * Community pending HOLD → RELEASE + cancelled.
 * Trade pending uses same hold table; cancel supported when domain=trade pending_review.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const orderId = (id ?? "").trim();
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if ((body.action ?? "").trim() !== "cancel") {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const { data: row } = await sb
    .from("point_promotion_orders")
    .select("id, domain, order_status, user_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!row?.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (String((row as { user_id?: string }).user_id) !== auth.userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const domain = String((row as { domain?: string }).domain ?? "");
  if (domain === "community") {
    const res = await cancelCommunityPaidExposure(sb, {
      orderId,
      userId: auth.userId,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    const balanceAfter = await readUserPointBalance(sb, auth.userId);
    return NextResponse.json({ ok: true, status: "cancelled", balanceAfter });
  }

  if (domain === "trade") {
    if (String((row as { order_status?: string }).order_status) !== "pending_review") {
      return NextResponse.json({ ok: false, error: "not_pending" }, { status: 400 });
    }
    const released = await releaseHeldPointsForPromotionOrder(sb, { orderId });
    if (!released.ok) {
      return NextResponse.json({ ok: false, error: released.error }, { status: 400 });
    }
    const { data: updated, error: upd } = await sb
      .from("point_promotion_orders")
      .update({
        order_status: "cancelled",
        review_reason: "member_cancelled",
      })
      .eq("id", orderId)
      .eq("order_status", "pending_review")
      .eq("user_id", auth.userId)
      .select("id")
      .maybeSingle();
    if (upd || !updated?.id) {
      return NextResponse.json(
        { ok: false, error: upd?.message ?? "cancel_race" },
        { status: 400 }
      );
    }
    const balanceAfter = await readUserPointBalance(sb, auth.userId);
    return NextResponse.json({ ok: true, status: "cancelled", balanceAfter });
  }

  return NextResponse.json({ ok: false, error: "unsupported_domain" }, { status: 400 });
}
