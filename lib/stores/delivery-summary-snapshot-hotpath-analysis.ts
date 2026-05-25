/**
 * Structured hot-path analysis for delivery summary aggregate.
 */
import type { DeliverySummarySnapshotBreakdown } from "@/lib/stores/delivery-summary-snapshot-regression-guard";

export type DeliverySummaryHotpathAnalysis = {
  route: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  payload_build_ms: number;
  order_aggregate_ms: number;
  sales_aggregate_ms: number;
  rider_aggregate_ms: number;
  refund_aggregate_ms: number;
  status_group_ms: number;
  dashboard_badge_ms: number;
  cache_hit: 0 | 1;
  wave_count: number;
  query_wave_2_ms: number;
  rpc_removed: 0 | 1;
  sequential_await_detected: 0 | 1;
  aggregate_compute_detected: 0 | 1;
  repeated_join_detected: 0 | 1;
  worst_stage: string;
  worst_stage_ms: number;
  structural_note?: string;
};

export function logDeliverySummaryHotpathAnalysis(
  breakdown: DeliverySummarySnapshotBreakdown,
  opts?: { structuralNote?: string }
): void {
  const analysis: DeliverySummaryHotpathAnalysis = {
    route: breakdown.route,
    total_ms: breakdown.total_ms,
    db_ms: breakdown.db_ms,
    round_trips: breakdown.round_trips,
    transport_ms: breakdown.transport_ms,
    payload_build_ms: breakdown.payload_build_ms,
    order_aggregate_ms: breakdown.order_aggregate_ms,
    sales_aggregate_ms: breakdown.sales_aggregate_ms,
    rider_aggregate_ms: breakdown.rider_aggregate_ms,
    refund_aggregate_ms: breakdown.refund_aggregate_ms,
    status_group_ms: breakdown.status_group_ms,
    dashboard_badge_ms: breakdown.dashboard_badge_ms,
    cache_hit: breakdown.cache_hit,
    wave_count: breakdown.wave_count,
    query_wave_2_ms: breakdown.query_wave_2_ms,
    rpc_removed: breakdown.rpc_removed,
    sequential_await_detected: breakdown.sequential_await_detected,
    aggregate_compute_detected: breakdown.aggregate_compute_detected,
    repeated_join_detected: breakdown.repeated_join_detected,
    worst_stage: breakdown.worst_stage,
    worst_stage_ms: breakdown.worst_stage_ms,
    structural_note: opts?.structuralNote,
  };
  // eslint-disable-next-line no-console -- required perf analysis output
  console.log("[delivery-summary-hotpath-analysis]", analysis);
}

let loggedDesign = false;

export function logDeliverySummarySnapshotRpcDesignOnce(): void {
  if (loggedDesign) return;
  loggedDesign = true;
  // eslint-disable-next-line no-console -- required design output
  console.log("[snapshot-rpc-design]", {
    route: "/api/me/stores/[storeId]/order-counts",
    rpc_name: "get_delivery_summary_snapshot",
    expected_round_trips: 1,
    replaces_queries: [
      "get_owner_store_ops_dashboard_snapshot (direct cold RPC every miss)",
      "get_owner_store_ops_snapshot_counts + store_ops meta (2 RTT fallback)",
      "legacy ~25 parallel count queries",
    ],
    snapshot_columns: ["payload_json", "store_id", "owner_user_id", "summary_scope", "updated_at"],
    invalidation_events: [
      "store order create/state change",
      "refund request/approve",
      "rider assign/delivery complete",
      "product/inquiry mutations affecting counts",
    ],
  });
}
