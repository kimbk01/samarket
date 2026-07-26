/**
 * SOL1 buyer orders list monolith hotpath analysis.
 */
import type { BuyerStoreOrdersListSnapshotBreakdown } from "@/lib/delivery/customer/buyer-store-orders-list-snapshot-regression-guard";

export type BuyerOrdersListMonolithAnalysis = {
  route: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  payload_build_ms: number;
  orders_fetch_ms: number;
  store_join_ms: number;
  items_summary_ms: number;
  payment_merge_ms: number;
  refund_merge_ms: number;
  delivery_merge_ms: number;
  unread_merge_ms: number;
  ordering_compute_ms: number;
  viewer_validation_ms: number;
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

export function logBuyerOrdersListMonolithAnalysis(
  breakdown: BuyerStoreOrdersListSnapshotBreakdown
): void {
  const analysis: BuyerOrdersListMonolithAnalysis = {
    route: breakdown.route,
    total_ms: breakdown.total_ms,
    db_ms: breakdown.db_ms,
    round_trips: breakdown.round_trips,
    transport_ms: breakdown.transport_ms,
    payload_build_ms: breakdown.payload_build_ms,
    orders_fetch_ms: breakdown.orders_fetch_ms,
    store_join_ms: breakdown.store_join_ms,
    items_summary_ms: breakdown.items_summary_ms,
    payment_merge_ms: breakdown.payment_merge_ms,
    refund_merge_ms: breakdown.refund_merge_ms,
    delivery_merge_ms: breakdown.delivery_merge_ms,
    unread_merge_ms: breakdown.unread_merge_ms,
    ordering_compute_ms: breakdown.ordering_compute_ms,
    viewer_validation_ms: breakdown.viewer_validation_ms,
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
  // eslint-disable-next-line no-console -- SOL1 required output
  console.log("[buyer-orders-list-monolith-analysis]", analysis);
}

let loggedDesign = false;

export function logBuyerStoreOrdersListSnapshotRpcDesignOnce(): void {
  if (loggedDesign) return;
  loggedDesign = true;
  // eslint-disable-next-line no-console -- SOL1 design reference
  console.log("[buyer-orders-list-snapshot-rpc-design]", {
    route: "/api/me/store-orders",
    rpc_name: "get_buyer_store_orders_list_snapshot",
    expected_round_trips: 1,
    invalidation_events: [
      "order_create",
      "order_accept",
      "order_status_change",
      "payment_update",
      "refund_request",
      "rider_assign",
      "chat_unread_change",
      "timeline_append",
    ],
  });
}
