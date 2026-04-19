import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  countPendingAcceptForStore,
  countPendingDeliveryAcceptForStore,
} from "@/lib/stores/owner-store-pending-counts";
import { countRefundRequestedForStore } from "@/lib/stores/owner-store-refund-count";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { getCachedStoreOrderCounts } from "@/lib/stores/store-order-counts-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 매장 오너: 접수 대기·동네배달·환불 요청 카운트 (허브 배지·알림용) */
export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { storeId } = await context.params;
  const id = typeof storeId === "string" ? storeId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getStoreIfOwner(sb, userId, id);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const payload = await getCachedStoreOrderCounts(id, async () => {
    const [refund_requested_count, pending_accept_count, pending_delivery_count] = await Promise.all([
      countRefundRequestedForStore(sb, id),
      countPendingAcceptForStore(sb, id),
      countPendingDeliveryAcceptForStore(sb, id),
    ]);
    return {
      ok: true as const,
      refund_requested_count,
      pending_accept_count,
      pending_delivery_count,
    };
  });

  return NextResponse.json(payload);
}
