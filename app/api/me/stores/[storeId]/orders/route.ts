import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { ownerAcceptRequiresRecordedPayment } from "@/lib/stores/owner-order-payment-policy";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import {
  countPendingAcceptForStore,
  countPendingDeliveryAcceptForStore,
} from "@/lib/stores/owner-store-pending-counts";
import { countRefundRequestedForStore } from "@/lib/stores/owner-store-refund-count";
import {

  BUYER_PUBLIC_LABEL_FALLBACK,
  mapBuyerUserIdsToPublicLabels,
} from "@/lib/stores/buyer-public-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 매장 오너: 해당 매장 주문 목록 + 라인 (?meta_only=1 이면 목록 없이 meta만) */
export async function GET(
  req: Request,
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

  const { data: storeAddr } = await sb
    .from("stores")
    .select("region, city, district, address_line1, address_line2")
    .eq("id", id)
    .maybeSingle();
  const store_pickup_address_lines = storeAddr
    ? formatStorePickupAddressLines({
        region: storeAddr.region as string | null | undefined,
        city: storeAddr.city as string | null | undefined,
        district: storeAddr.district as string | null | undefined,
        address_line1: storeAddr.address_line1 as string | null | undefined,
        address_line2: storeAddr.address_line2 as string | null | undefined,
      })
    : [];

  const metaOnly = new URL(req.url).searchParams.get("meta_only") === "1";
  if (metaOnly) {
    const [refund_requested_count, pending_accept_count, pending_delivery_count] = await Promise.all([
      countRefundRequestedForStore(sb, id),
      countPendingAcceptForStore(sb, id),
      countPendingDeliveryAcceptForStore(sb, id),
    ]);
    return NextResponse.json({
      ok: true,
      meta: {
        owner_accept_requires_payment: ownerAcceptRequiresRecordedPayment(),
        refund_requested_count,
        pending_accept_count,
        pending_delivery_count,
        store_pickup_address_lines,
      },
    });
  }

  const { data: orders, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, order_no, buyer_user_id, total_amount, payment_amount, delivery_fee_amount, delivery_courier_label, payment_status, order_status, fulfillment_type, buyer_note, buyer_phone, buyer_payment_method, buyer_payment_method_detail, delivery_address_summary, delivery_address_detail, created_at, auto_complete_at, community_messenger_room_id"
    )
    .eq("store_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (oErr) {
    console.error("[GET store orders]", oErr);
    return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });
  }

  const [refund_requested_count, pending_accept_count, pending_delivery_count] = await Promise.all([
    countRefundRequestedForStore(sb, id),
    countPendingAcceptForStore(sb, id),
    countPendingDeliveryAcceptForStore(sb, id),
  ]);

  const list = orders ?? [];
  const buyerIds = list.map((o) => String((o as { buyer_user_id?: string }).buyer_user_id ?? "").trim());
  const buyerPublicById = await mapBuyerUserIdsToPublicLabels(sb, buyerIds);

  const orderIds = list.map((o) => o.id as string);
  const itemsByOrder: Record<string, unknown[]> = {};
  if (orderIds.length) {
    const { data: items, error: iErr } = await sb
      .from("store_order_items")
      .select("id, order_id, product_id, product_title_snapshot, price_snapshot, qty, subtotal, options_snapshot_json")
      .in("order_id", orderIds);
    if (iErr) {
      console.error("[GET store order items]", iErr);
      return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });
    }
    for (const row of items ?? []) {
      const oid = row.order_id as string;
      if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
      itemsByOrder[oid].push(row);
    }
  }

  return NextResponse.json({
    ok: true,
    meta: {
      owner_accept_requires_payment: ownerAcceptRequiresRecordedPayment(),
      refund_requested_count,
      pending_accept_count,
      pending_delivery_count,
      store_pickup_address_lines,
    },
    orders: list.map((o) => {
      const bid = String((o as { buyer_user_id?: string }).buyer_user_id ?? "").trim();
      return {
        ...o,
        buyer_public_label: bid
          ? (buyerPublicById[bid] ?? BUYER_PUBLIC_LABEL_FALLBACK)
          : BUYER_PUBLIC_LABEL_FALLBACK,
        items: itemsByOrder[o.id as string] ?? [],
      };
    }),
  });
}
