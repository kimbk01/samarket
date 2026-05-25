/**
 * Legacy multi-wave buyer store order detail — temporary fallback only (SOD1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBuyerStoreOrderReviewForOrder } from "@/lib/stores/buyer-store-order-review-meta";
import {
  buildBuyerStoreOrderDetailResponseBody,
  gateDataFromLegacyInput,
} from "@/lib/stores/store-order-detail-snapshot-assemble";
import { auditLegacyFallbackUsage } from "@/lib/ops/legacy-fallback-usage-audit";

async function loadDeliverySnapshot(
  sb: SupabaseClient<any>,
  orderId: string
): Promise<
  | { ok: true; delivery: Record<string, unknown> | null }
  | { ok: false; error: string }
> {
  const { data, error } = await sb
    .from("store_order_deliveries")
    .select(
      "order_id, rider_id, delivery_status, assigned_at, picked_up_at, delivered_at, rider_accepted_at, customer_arrived_at, rider_decline_reason, delivered_confirmed_at, delivered_receiver_name, updated_at"
    )
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    if (/store_order_deliveries/i.test(String(error.message)) && /does not exist/i.test(String(error.message))) {
      return { ok: true, delivery: null };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, delivery: (data as Record<string, unknown>) ?? null };
}

async function isBuyerHiddenStoreOrder(
  sb: SupabaseClient<any>,
  buyerUserId: string,
  orderId: string
): Promise<boolean> {
  const { data, error } = await sb
    .from("store_order_buyer_hides")
    .select("order_id")
    .eq("buyer_user_id", buyerUserId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) {
    if (error.message?.includes("store_order_buyer_hides") && error.message.includes("does not exist")) {
      return false;
    }
    throw error;
  }
  return !!data;
}

export type BuyerStoreOrderDetailLegacyResult = {
  body: ReturnType<typeof buildBuyerStoreOrderDetailResponseBody>;
  orderFetchMs: number;
  itemsFetchMs: number;
  reviewMetaMs: number;
  deliveryMs: number;
  dbMs: number;
};

export async function buildBuyerStoreOrderDetailLegacy(
  sb: SupabaseClient<any>,
  buyerId: string,
  orderId: string
): Promise<
  | { ok: true; result: BuyerStoreOrderDetailLegacyResult }
  | { ok: false; status: number; error: string }
> {
  auditLegacyFallbackUsage({
    route: "/api/me/store-orders/[orderId]",
    fallback_branch: "legacy_parallel_aggregate",
    reason: "unified_rpc_unavailable",
  });
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot deploy probe
    console.warn("[store-order-detail-snapshot-fallback]", {
      order_id: orderId,
      reason: "unified_rpc_unavailable",
    });
  }

  const db0 = performance.now();
  const tOrder0 = performance.now();
  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, order_no, store_id, buyer_user_id, total_amount, discount_amount, payment_amount, delivery_fee_amount, delivery_courier_label, payment_status, order_status, fulfillment_type, buyer_note, buyer_phone, buyer_payment_method, buyer_payment_method_detail, delivery_address_summary, delivery_address_detail, delivery_user_address_id, delivery_place_id, delivery_formatted_address, delivery_detail_address, delivery_note, delivery_latitude, delivery_longitude, created_at, updated_at, auto_complete_at, community_messenger_room_id, estimated_prep_minutes, estimated_ready_at, accepted_at, admin_locked, sla_warning_level, sla_warning_reason, sla_warning_at, needs_admin_attention, checkout_prep_minutes, checkout_ride_minutes, checkout_eta_minutes, checkout_eta_computed_at, checkout_route_distance_meters, checkout_straight_distance_meters"
    )
    .eq("id", orderId)
    .eq("buyer_user_id", buyerId)
    .maybeSingle();
  const orderFetchMs = Math.round(performance.now() - tOrder0);

  if (oErr || !order) {
    return { ok: false, status: 404, error: "not_found" };
  }

  try {
    const hidden = await isBuyerHiddenStoreOrder(sb, buyerId, orderId);
    if (hidden) {
      return { ok: false, status: 404, error: "not_found" };
    }
  } catch {
    return { ok: false, status: 500, error: "hidden_check_failed" };
  }

  const storeId = order.store_id as string;
  const tItems0 = performance.now();
  const itemsPromise = sb
    .from("store_order_items")
    .select("id, product_id, product_title_snapshot, price_snapshot, qty, subtotal, options_snapshot_json")
    .eq("order_id", orderId)
    .order("id")
    .then((r) => ({ r, ms: Math.round(performance.now() - tItems0) }));

  const storePromise = sb
    .from("stores")
    .select("store_name, slug, owner_user_id, region, city, district, address_line1, address_line2")
    .eq("id", storeId)
    .maybeSingle();

  const tReview0 = performance.now();
  const reviewPromise = loadBuyerStoreOrderReviewForOrder(sb, orderId).then((r) => ({
    r,
    ms: Math.round(performance.now() - tReview0),
  }));

  const tDelivery0 = performance.now();
  const deliveryPromise = loadDeliverySnapshot(sb, orderId).then((r) => ({
    r,
    ms: Math.round(performance.now() - tDelivery0),
  }));

  const [{ r: itemsRes, ms: itemsFetchMs }, { data: store }, { r: reviewMeta, ms: reviewMetaMs }, { r: deliverySnap, ms: deliveryMs }] =
    await Promise.all([itemsPromise, storePromise, reviewPromise, deliveryPromise]);

  if (itemsRes.error) {
    return { ok: false, status: 500, error: itemsRes.error.message };
  }

  const { review: buyerReview, revErr } = reviewMeta;
  const reviewsUnavailable = !!(
    revErr?.message?.includes("store_reviews") && revErr.message.includes("does not exist")
  );

  const body = buildBuyerStoreOrderDetailResponseBody(
    gateDataFromLegacyInput({
      order: order as Record<string, unknown>,
      items: (itemsRes.data ?? []) as Record<string, unknown>[],
      store: store as Record<string, unknown> | null | undefined,
      delivery: deliverySnap.ok ? deliverySnap.delivery : null,
      review: buyerReview,
      reviewsUnavailable,
    })
  );

  return {
    ok: true,
    result: {
      body,
      orderFetchMs,
      itemsFetchMs,
      reviewMetaMs,
      deliveryMs,
      dbMs: Math.round(performance.now() - db0),
    },
  };
}
