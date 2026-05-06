import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { stripDeliveryProofStorageFromClientRow } from "@/lib/stores/delivery-proof-admin-view";
import { getDeliveryRiderForUser, STORE_ORDER_DELIVERY_ROW_SELECT } from "@/lib/stores/store-order-delivery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const riderGate = await getDeliveryRiderForUser(sb, userId);
  if (!riderGate.ok) {
    return NextResponse.json({ ok: false, error: riderGate.error }, { status: riderGate.httpStatus });
  }

  const { data: dels, error: dErr } = await sb
    .from("store_order_deliveries")
    .select(STORE_ORDER_DELIVERY_ROW_SELECT)
    .eq("rider_id", riderGate.rider.id)
    .order("updated_at", { ascending: false })
    .limit(120);

  if (dErr) return NextResponse.json({ ok: false, error: dErr.message }, { status: 500 });

  const orderIds = [...new Set((dels ?? []).map((d) => String((d as { order_id: string }).order_id)))];
  if (orderIds.length === 0) {
    return NextResponse.json({ ok: true, rider: riderGate.rider, orders: [] });
  }

  const { data: orders, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, order_no, order_status, store_id, fulfillment_type, delivery_address_summary, buyer_phone, payment_amount"
    )
    .in("id", orderIds);

  if (oErr) return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });

  const orderMap = new Map<string, Record<string, unknown>>();
  for (const o of orders ?? []) {
    orderMap.set(String((o as { id: string }).id), o as Record<string, unknown>);
  }

  const merged = (dels ?? []).map((d) => {
    const row = d as Record<string, unknown>;
    const oid = String(row.order_id ?? "");
    return {
      delivery: stripDeliveryProofStorageFromClientRow(row),
      order: orderMap.get(oid) ?? { id: oid },
    };
  });

  return NextResponse.json({ ok: true, rider: riderGate.rider, orders: merged });
}
