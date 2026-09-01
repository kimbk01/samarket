import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { listPointPromotionOrders } from "@/lib/points/point-promotion-orders-db";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/promoted-items
 * Admin: Member Point promotion entitlements (`point_promotion_orders`).
 * NOT post_ads / NOT feed banner campaigns.
 */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({
      ok: true,
      items: [],
      meta: { source: "unavailable" as const, authority: "point_promotion_orders" },
    });
  }

  try {
    const orders = await listPointPromotionOrders(svc, 300);
    const now = Date.now();
    const items = orders
      .filter((o) => o.targetType === "product")
      .map((o) => {
        const start = Date.parse(o.startAt);
        const end = Date.parse(o.endAt);
        let status: "scheduled" | "active" | "expired" | "paused" = "expired";
        if (o.orderStatus === "cancelled") status = "paused";
        else if (Number.isFinite(start) && start > now) status = "scheduled";
        else if (o.orderStatus === "active" && Number.isFinite(end) && end >= now) status = "active";
        else if (o.orderStatus === "expired" || (Number.isFinite(end) && end < now)) status = "expired";
        else if (o.orderStatus === "active") status = "active";
        return {
          id: o.id,
          targetId: o.targetId,
          targetTitle: o.targetTitle || o.targetId,
          placement: o.placement === "feed_boost" ? "home_top" : o.placement,
          status,
          startAt: o.startAt,
          endAt: o.endAt,
          pointCost: o.pointCost,
          productId: o.productId ?? null,
          domain: o.domain ?? "trade",
          userId: o.userId,
          authority: "point_promotion_orders" as const,
        };
      });

    return NextResponse.json({
      ok: true,
      items,
      meta: { source: "supabase" as const, authority: "point_promotion_orders" },
    });
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    if (isMissingPointsTable(msg, "point_promotion_orders")) {
      return NextResponse.json({
        ok: true,
        items: [],
        meta: { source: "missing_table" as const, authority: "point_promotion_orders" },
      });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
