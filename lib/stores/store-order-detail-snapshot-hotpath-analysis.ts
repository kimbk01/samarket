/**
 * SOD1 store order detail monolith hotpath analysis.
 */
import type { StoreOrderDetailSnapshotBreakdown } from "@/lib/stores/store-order-detail-snapshot-regression-guard";

export type StoreOrderDetailMonolithAnalysis = {
  route: string;
  order_id: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  payload_build_ms: number;
  order_fetch_ms: number;
  items_fetch_ms: number;
  buyer_profile_join_ms: number;
  rider_join_ms: number;
  payment_merge_ms: number;
  refund_merge_ms: number;
  timeline_merge_ms: number;
  unread_merge_ms: number;
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

export function logStoreOrderDetailMonolithAnalysis(
  breakdown: StoreOrderDetailSnapshotBreakdown
): void {
  const analysis: StoreOrderDetailMonolithAnalysis = {
    route: breakdown.route,
    order_id: breakdown.order_id,
    total_ms: breakdown.total_ms,
    db_ms: breakdown.db_ms,
    round_trips: breakdown.round_trips,
    transport_ms: breakdown.transport_ms,
    payload_build_ms: breakdown.payload_build_ms,
    order_fetch_ms: breakdown.order_fetch_ms,
    items_fetch_ms: breakdown.items_fetch_ms,
    buyer_profile_join_ms: breakdown.buyer_profile_join_ms,
    rider_join_ms: breakdown.rider_join_ms,
    payment_merge_ms: breakdown.payment_merge_ms,
    refund_merge_ms: breakdown.refund_merge_ms,
    timeline_merge_ms: breakdown.timeline_merge_ms,
    unread_merge_ms: breakdown.unread_merge_ms,
    ownership_check_ms: breakdown.ownership_check_ms,
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
  // eslint-disable-next-line no-console -- SOD1 required output
  console.log("[store-order-detail-monolith-analysis]", analysis);
}

let loggedDesign = false;

export function logStoreOrderDetailSnapshotRpcDesignOnce(): void {
  if (loggedDesign) return;
  loggedDesign = true;
  // eslint-disable-next-line no-console -- SOD1 design reference
  console.log("[store-order-detail-snapshot-rpc-design]", {
    route: "/api/me/store-orders/[orderId]",
    rpc_name: "get_store_order_detail_snapshot",
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
