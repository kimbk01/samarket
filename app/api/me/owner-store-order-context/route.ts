/**
 * 오너: order_id로 소유 매장(store_id, slug) 조회 — 통합 주문 채팅 진입용
 */
import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { loadOwnerStoreOrderContext } from "@/lib/business/load-owner-store-order-context";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const orderId = req.nextUrl.searchParams.get("order_id")?.trim() ?? "";
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "missing_order_id" }, { status: 400 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const ctx = await loadOwnerStoreOrderContext(sb, userId, orderId);
  if (!ctx.ok) {
    const status = ctx.error === "not_found" ? 404 : 403;
    return NextResponse.json({ ok: false, error: ctx.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    store_id: ctx.context.store_id,
    slug: ctx.context.slug,
  });
}
