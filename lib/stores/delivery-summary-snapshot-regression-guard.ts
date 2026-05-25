/**
 * Delivery summary regression guards.
 */
export type DeliverySummaryRegressionAlert = {
  transport_regression: 0 | 1;
  sequential_await_detected: 0 | 1;
  repeated_join_detected: 0 | 1;
  aggregate_recompute_detected: 0 | 1;
  legacy_fallback_used: 0 | 1;
  stale_snapshot_detected: 0 | 1;
  alerts: string[];
};

export type DeliverySummarySnapshotBreakdown = {
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
  sequential_await_detected: 0 | 1;
  aggregate_compute_detected: 0 | 1;
  repeated_join_detected: 0 | 1;
  worst_stage: string;
  worst_stage_ms: number;
  cache_hit_reason: string;
  rpc_removed: 0 | 1;
  snapshot_via?: "counter_row" | "unified_rpc" | "legacy_aggregate";
};

type GuardInput = {
  breakdown: DeliverySummarySnapshotBreakdown;
  allowedRoundTrips?: number;
  snapshotVia?: "counter_row" | "unified_rpc" | "legacy_aggregate";
  staleSnapshot?: boolean;
};

export function evaluateDeliverySummaryRegressionGuards(
  input: GuardInput
): DeliverySummaryRegressionAlert {
  const b = input.breakdown;
  const alerts: string[] = [];
  const allowed = input.allowedRoundTrips ?? 1;

  if ((b.query_wave_2_ms ?? 0) > 0 && input.snapshotVia !== "legacy_aggregate") {
    alerts.push(`query_wave_2_ms>${b.query_wave_2_ms}`);
  }
  if (b.round_trips > allowed && input.snapshotVia !== "legacy_aggregate") {
    alerts.push(`db_round_trips>${b.round_trips}`);
  }
  if (input.snapshotVia === "legacy_aggregate") alerts.push("legacy_fallback_used");
  if (b.sequential_await_detected) alerts.push("sequential_await_detected");
  if (b.repeated_join_detected) alerts.push("repeated_order_store_join");
  if (b.aggregate_compute_detected && input.snapshotVia === "legacy_aggregate") {
    alerts.push("aggregate_recompute_detected");
  }
  const transportRegression =
    input.snapshotVia === "legacy_aggregate" && b.db_ms > 120 ? 1 : 0;
  if (transportRegression) alerts.push("transport_regression");

  const alert: DeliverySummaryRegressionAlert = {
    transport_regression: transportRegression as 0 | 1,
    sequential_await_detected: b.sequential_await_detected,
    repeated_join_detected: b.repeated_join_detected,
    aggregate_recompute_detected: (input.snapshotVia === "legacy_aggregate" ? 1 : 0) as 0 | 1,
    legacy_fallback_used: (input.snapshotVia === "legacy_aggregate" ? 1 : 0) as 0 | 1,
    stale_snapshot_detected: (input.staleSnapshot ? 1 : 0) as 0 | 1,
    alerts,
  };

  if (alerts.length > 0) {
    // eslint-disable-next-line no-console -- regression guard
    console.warn("[delivery-summary-regression-alert]", {
      ...alert,
      breakdown: b,
      snapshotVia: input.snapshotVia,
    });
  }
  return alert;
}
