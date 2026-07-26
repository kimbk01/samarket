/**
 * OOL1 owner orders list hotpath analysis.
 */
import type { OwnerStoreOrdersListSnapshotBreakdown } from "@/lib/delivery/owner/owner-store-orders-list-snapshot-regression-guard";

export type OwnerOrdersListHotpathAnalysis = {
  route: string;
  store_id: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  payload_build_ms: number;
  orders_fetch_ms: number;
  customer_profile_join_ms: number;
  order_items_summary_ms: number;
  delivery_status_merge_ms: number;
  payment_status_merge_ms: number;
  chat_unread_merge_ms: number;
  status_filter_ms: number;
  sort_compute_ms: number;
  ownership_check_ms: number;
  cache_hit: 0 | 1;
  wave_count: number;
  query_wave_2_ms: number;
  sequential_await_detected: 0 | 1;
  aggregate_compute_detected: 0 | 1;
  repeated_join_detected: 0 | 1;
  fallback_used: 0 | 1;
  worst_stage: string;
  worst_stage_ms: number;
};

export function logOwnerOrdersListHotpathAnalysis(
  breakdown: OwnerStoreOrdersListSnapshotBreakdown,
  opts?: { storeId?: string; ownershipCheckMs?: number }
): void {
  const analysis: OwnerOrdersListHotpathAnalysis = {
    route: breakdown.route,
    store_id: opts?.storeId ?? breakdown.store_id ?? "",
    total_ms: breakdown.total_ms,
    db_ms: breakdown.db_ms,
    round_trips: breakdown.round_trips,
    transport_ms: breakdown.transport_ms,
    payload_build_ms: breakdown.payload_build_ms,
    orders_fetch_ms: breakdown.orders_fetch_ms,
    customer_profile_join_ms: breakdown.customer_profile_join_ms,
    order_items_summary_ms: breakdown.order_items_summary_ms,
    delivery_status_merge_ms: breakdown.delivery_status_merge_ms,
    payment_status_merge_ms: breakdown.payment_status_merge_ms,
    chat_unread_merge_ms: breakdown.chat_unread_merge_ms,
    status_filter_ms: breakdown.status_filter_ms,
    sort_compute_ms: breakdown.sort_compute_ms,
    ownership_check_ms: opts?.ownershipCheckMs ?? breakdown.ownership_check_ms ?? 0,
    cache_hit: breakdown.cache_hit,
    wave_count: breakdown.wave_count,
    query_wave_2_ms: breakdown.query_wave_2_ms,
    sequential_await_detected: breakdown.sequential_await_detected,
    aggregate_compute_detected: breakdown.aggregate_compute_detected,
    repeated_join_detected: breakdown.repeated_join_detected,
    fallback_used: breakdown.fallback_used,
    worst_stage: breakdown.worst_stage,
    worst_stage_ms: breakdown.worst_stage_ms,
  };
  // eslint-disable-next-line no-console -- OOL1 required output
  console.log("[owner-orders-list-hotpath-analysis]", analysis);
}

let loggedDesign = false;

export function logOwnerStoreOrdersListSnapshotRpcDesignOnce(): void {
  if (loggedDesign) return;
  loggedDesign = true;
  // eslint-disable-next-line no-console -- OOL1 design reference
  console.log("[owner-orders-list-snapshot-rpc-design]", {
    route: "/api/me/stores/[storeId]/orders",
    rpc_name: "get_owner_store_orders_list_snapshot",
    expected_round_trips: 1,
    invalidation_events: [
      "order_create",
      "order_accept",
      "order_status_change",
      "payment_update",
      "delivery_update",
      "cancel_refund",
      "order_chat_unread",
    ],
  });
}
