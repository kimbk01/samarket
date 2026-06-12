import { NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";
import { listPointPromotionOrders } from "@/lib/points/point-promotion-orders-db";
import { filterActiveProductPromotionOrders } from "@/lib/exposure/point-promotion-exposure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/exposure/point-promotion-orders — 노출 점수용 활성 프로모션 주문(상품) */
export async function GET(): Promise<NextResponse> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, orders: [] });
  }
  try {
    const all = await listPointPromotionOrders(sb, 1000);
    const orders = filterActiveProductPromotionOrders(all);
    return NextResponse.json({ ok: true, orders });
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    if (isMissingPointsTable(msg, "point_promotion_orders")) {
      return NextResponse.json({ ok: true, orders: [] });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
