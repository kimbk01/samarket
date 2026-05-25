/**
 * Legacy multi-wave owner orders list builder — temporary fallback only (OOL1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import { BUYER_PUBLIC_LABEL_FALLBACK } from "@/lib/stores/buyer-public-label";
import { mapBuyerUserIdsToPublicLabelsCached } from "@/lib/stores/buyer-public-label-cache";
import { auditLegacyFallbackUsage } from "@/lib/ops/legacy-fallback-usage-audit";

export const OWNER_ORDERS_LIST_LIMIT = 60;

export const ORDERS_LIST_SELECT =
  "id, order_no, buyer_user_id, total_amount, payment_amount, delivery_fee_amount, delivery_courier_label, payment_status, order_status, fulfillment_type, buyer_note, buyer_phone, buyer_payment_method, buyer_payment_method_detail, delivery_address_summary, delivery_address_detail, delivery_user_address_id, delivery_place_id, delivery_formatted_address, delivery_detail_address, delivery_note, delivery_latitude, delivery_longitude, created_at, updated_at, auto_complete_at, community_messenger_room_id, estimated_prep_minutes, estimated_ready_at, accepted_at, admin_locked, admin_flagged, dispute_status, admin_note, sla_warning_level, sla_warning_reason, sla_warning_at, needs_admin_attention, checkout_prep_minutes, checkout_ride_minutes, checkout_eta_minutes, checkout_eta_computed_at, checkout_route_distance_meters, checkout_straight_distance_meters";

const ORDER_ITEMS_LIST_SELECT =
  "id, order_id, product_id, product_title_snapshot, price_snapshot, qty, subtotal, options_snapshot_json";

export type OwnerStoreOrdersListLegacyResult = {
  orders: OwnerStoreOrderListRow[];
  dbRoundTrips: number;
  listMs: number;
  transformMs: number;
  normalizeMs: number;
  attachMs: number;
  buyerLabelCacheHit: boolean;
};

export async function buildOwnerStoreOrdersListLegacy(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<{ ok: true; result: OwnerStoreOrdersListLegacyResult } | { ok: false; error: string }> {
  auditLegacyFallbackUsage({
    route: "/api/me/stores/[storeId]/orders",
    fallback_branch: "legacy_multi_wave_aggregate",
    reason: "unified_rpc_unavailable",
  });
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot deploy probe
    console.warn("[owner-orders-list-snapshot-fallback]", {
      store_id: storeId,
      reason: "unified_rpc_unavailable",
    });
  }

  const db0 = performance.now();
  const ordersRes = await sb
    .from("store_orders")
    .select(ORDERS_LIST_SELECT)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(OWNER_ORDERS_LIST_LIMIT);

  if (ordersRes.error) {
    return { ok: false, error: ordersRes.error.message };
  }

  const list = ordersRes.data ?? [];
  const listMs = Math.round(performance.now() - db0);
  const transform0 = performance.now();

  const buyerIds = list.map((o) => String((o as { buyer_user_id?: string }).buyer_user_id ?? "").trim());
  const orderIds = list.map((o) => o.id as string);

  const label0 = performance.now();
  const [buyerLabelRes, itemsRes, revRes] = await Promise.all([
    mapBuyerUserIdsToPublicLabelsCached(sb, buyerIds),
    orderIds.length > 0
      ? sb.from("store_order_items").select(ORDER_ITEMS_LIST_SELECT).in("order_id", orderIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null as null }),
    orderIds.length > 0
      ? sb.from("store_reviews").select("id, order_id").in("order_id", orderIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null as null }),
  ]);

  const normalizeMs = Math.round(performance.now() - label0);

  if (itemsRes.error) {
    return { ok: false, error: itemsRes.error.message };
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
    }
  } else {
    for (const row of revRes.data ?? []) {
      const oid = String((row as { order_id?: unknown }).order_id ?? "").trim();
      if (oid) reviewedOrderIds.add(oid);
    }
  }

  const attach0 = performance.now();
  const orders = list.map((o) => {
    const bid = String((o as { buyer_user_id?: string }).buyer_user_id ?? "").trim();
    const labels = buyerLabelRes.labels;
    return {
      ...o,
      buyer_public_label: bid ? (labels[bid] ?? BUYER_PUBLIC_LABEL_FALLBACK) : BUYER_PUBLIC_LABEL_FALLBACK,
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
  }) as OwnerStoreOrderListRow[];

  const attachMs = Math.round(performance.now() - attach0);
  const transformMs = Math.round(performance.now() - transform0);

  return {
    ok: true,
    result: {
      orders,
      dbRoundTrips: 3,
      listMs,
      transformMs,
      normalizeMs,
      attachMs,
      buyerLabelCacheHit: buyerLabelRes.cache_hit,
    },
  };
}
