import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { ownerAcceptRequiresRecordedPayment } from "@/lib/stores/owner-order-payment-policy";
import {
  getCachedStoreIfOwner,
  peekOwnerStoreOwnershipCacheHit,
} from "@/lib/stores/owner-store-ownership-cache";
import {
  BUYER_PUBLIC_LABEL_FALLBACK,
  mapBuyerUserIdsToPublicLabels,
} from "@/lib/stores/buyer-public-label";
import { fetchOwnerStoreOrderCounts } from "@/lib/stores/fetch-owner-store-order-counts";
import {
  getCachedStoreOrderCounts,
  type StoreOrderCountsPayload,
} from "@/lib/stores/store-order-counts-cache";
import { jsonPayloadBytes, logOwnerDashboardPerf, perfNowMs } from "@/lib/stores/owner-dashboard-perf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/me/stores/[storeId]/orders";
const ORDERS_LIST_LIMIT = 60;

const ORDERS_LIST_SELECT =
  "id, order_no, buyer_user_id, total_amount, payment_amount, delivery_fee_amount, delivery_courier_label, payment_status, order_status, fulfillment_type, buyer_note, buyer_phone, buyer_payment_method, buyer_payment_method_detail, delivery_address_summary, delivery_address_detail, delivery_user_address_id, delivery_place_id, delivery_formatted_address, delivery_detail_address, delivery_note, delivery_latitude, delivery_longitude, created_at, updated_at, auto_complete_at, community_messenger_room_id, estimated_prep_minutes, estimated_ready_at, accepted_at, admin_locked, admin_flagged, dispute_status, admin_note, sla_warning_level, sla_warning_reason, sla_warning_at, needs_admin_attention, checkout_prep_minutes, checkout_ride_minutes, checkout_eta_minutes, checkout_eta_computed_at, checkout_route_distance_meters, checkout_straight_distance_meters";

const ORDER_ITEMS_LIST_SELECT =
  "id, order_id, product_id, product_title_snapshot, price_snapshot, qty, subtotal, options_snapshot_json";

/** 매장 오너: 해당 매장 주문 목록 + 라인 (?meta_only=1 이면 목록 없이 meta만) */
export async function GET(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const wall0 = perfNowMs();
  let auth_ms = 0;
  let ownership_ms = 0;
  let db_ms = 0;
  let count_ms = 0;
  let list_ms = 0;
  let transform_ms = 0;

  const auth0 = perfNowMs();
  const userId = await getRouteUserId();
  auth_ms = Math.round(perfNowMs() - auth0);

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

  const ownershipCachedBefore = peekOwnerStoreOwnershipCacheHit(userId, id);

  const own0 = perfNowMs();
  const gate = await getCachedStoreIfOwner(sb, userId, id);
  ownership_ms = Math.round(perfNowMs() - own0);
  if (!gate.ok) {
    logOwnerDashboardPerf({
      route: ROUTE,
      store_id: id,
      total_ms: Math.round(perfNowMs() - wall0),
      auth_ms,
      ownership_ms,
      ownership_cache_hit: ownershipCachedBefore ? 1 : 0,
    });
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const metaOnly = new URL(req.url).searchParams.get("meta_only") === "1";

  const db0 = perfNowMs();

  const countPromise = getCachedStoreOrderCounts(id, async (): Promise<StoreOrderCountsPayload> => {
    const counts = await fetchOwnerStoreOrderCounts(sb, id);
    return { ok: true as const, ...counts };
  }).then((r) => r.payload);

  const storeAddrPromise = sb
    .from("stores")
    .select("region, city, district, address_line1, address_line2")
    .eq("id", id)
    .maybeSingle();

  const ordersPromise = metaOnly
    ? Promise.resolve({ data: null as null, error: null as null })
    : sb
        .from("store_orders")
        .select(ORDERS_LIST_SELECT)
        .eq("store_id", id)
        .order("created_at", { ascending: false })
        .limit(ORDERS_LIST_LIMIT);

  const [countsPayload, storeAddrRes, ordersRes] = await Promise.all([
    countPromise,
    storeAddrPromise,
    ordersPromise,
  ]);

  db_ms = Math.round(perfNowMs() - db0);
  count_ms = db_ms;

  const storeAddr = storeAddrRes.data;
  const store_pickup_address_lines = storeAddr
    ? formatStorePickupAddressLines({
        region: storeAddr.region as string | null | undefined,
        city: storeAddr.city as string | null | undefined,
        district: storeAddr.district as string | null | undefined,
        address_line1: storeAddr.address_line1 as string | null | undefined,
        address_line2: storeAddr.address_line2 as string | null | undefined,
      })
    : [];

  const meta = {
    owner_accept_requires_payment: ownerAcceptRequiresRecordedPayment(),
    refund_requested_count: countsPayload.refund_requested_count,
    pending_accept_count: countsPayload.pending_accept_count,
    pending_delivery_count: countsPayload.pending_delivery_count,
    store_pickup_address_lines,
  };

  if (metaOnly) {
    const body = { ok: true as const, meta };
    const total_ms = Math.round(perfNowMs() - wall0);
    logOwnerDashboardPerf({
      route: ROUTE,
      store_id: id,
      total_ms,
      auth_ms,
      ownership_ms,
      db_ms,
      count_ms,
      meta_only: 1,
      ownership_cache_hit: ownershipCachedBefore ? 1 : 0,
      result_count: 0,
      payload_bytes: jsonPayloadBytes(body),
    });
    return NextResponse.json(body);
  }

  if (ordersRes.error) {
    console.error("[GET store orders]", ordersRes.error);
    logOwnerDashboardPerf({
      route: ROUTE,
      store_id: id,
      total_ms: Math.round(perfNowMs() - wall0),
      auth_ms,
      ownership_ms,
      db_ms,
    });
    return NextResponse.json({ ok: false, error: ordersRes.error.message }, { status: 500 });
  }

  const list = ordersRes.data ?? [];
  list_ms = db_ms;

  const transform0 = perfNowMs();
  const buyerIds = list.map((o) => String((o as { buyer_user_id?: string }).buyer_user_id ?? "").trim());
  const orderIds = list.map((o) => o.id as string);

  const [buyerPublicById, itemsRes, revRes] = await Promise.all([
    mapBuyerUserIdsToPublicLabels(sb, buyerIds),
    orderIds.length > 0
      ? sb
          .from("store_order_items")
          .select(ORDER_ITEMS_LIST_SELECT)
          .in("order_id", orderIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null as null }),
    orderIds.length > 0
      ? sb.from("store_reviews").select("id, order_id").in("order_id", orderIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null as null }),
  ]);

  if (itemsRes.error) {
    console.error("[GET store order items]", itemsRes.error);
    logOwnerDashboardPerf({
      route: ROUTE,
      store_id: id,
      total_ms: Math.round(perfNowMs() - wall0),
      auth_ms,
      ownership_ms,
      db_ms,
      list_ms,
    });
    return NextResponse.json({ ok: false, error: itemsRes.error.message }, { status: 500 });
  }

  const itemsByOrder: Record<string, unknown[]> = {};
  for (const row of itemsRes.data ?? []) {
    const oid = row.order_id as string;
    if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
    itemsByOrder[oid].push(row);
  }

  const reviewedOrderIds = new Set<string>();
  let reviewsUnavailable = false;
  if (revRes.error) {
    if (revRes.error.message?.includes("store_reviews") && revRes.error.message.includes("does not exist")) {
      reviewsUnavailable = true;
    } else {
      console.error("[GET owner store orders reviews]", revRes.error);
    }
  } else {
    for (const row of revRes.data ?? []) {
      const oid = String((row as { order_id?: unknown }).order_id ?? "").trim();
      if (oid) reviewedOrderIds.add(oid);
    }
  }

  const orders = list.map((o) => {
    const bid = String((o as { buyer_user_id?: string }).buyer_user_id ?? "").trim();
    return {
      ...o,
      buyer_public_label: bid
        ? (buyerPublicById[bid] ?? BUYER_PUBLIC_LABEL_FALLBACK)
        : BUYER_PUBLIC_LABEL_FALLBACK,
      items: itemsByOrder[o.id as string] ?? [],
      review_status:
        o.order_status !== "completed"
          ? "not_applicable"
          : reviewedOrderIds.has(o.id as string)
            ? "completed"
            : reviewsUnavailable
              ? "unavailable"
              : "pending",
    };
  });
  transform_ms = Math.round(perfNowMs() - transform0);

  const body = { ok: true as const, meta, orders };
  const total_ms = Math.round(perfNowMs() - wall0);

  logOwnerDashboardPerf({
    route: ROUTE,
    store_id: id,
    total_ms,
    auth_ms,
    ownership_ms,
    db_ms,
    count_ms,
    list_ms,
    transform_ms,
    ownership_cache_hit: ownershipCachedBefore ? 1 : 0,
    result_count: orders.length,
    payload_bytes: jsonPayloadBytes(body),
  });

  return NextResponse.json(body);
}
