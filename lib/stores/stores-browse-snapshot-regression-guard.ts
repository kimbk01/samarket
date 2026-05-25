/**
 * SB1 stores browse regression guards.
 */

export type StoresBrowseSnapshotBreakdown = {
  route: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  payload_build_ms: number;
  stores_fetch_ms: number;
  category_join_ms: number;
  review_merge_ms: number;
  rating_merge_ms: number;
  delivery_meta_merge_ms: number;
  recommendation_merge_ms: number;
  search_filter_compute_ms: number;
  ordering_compute_ms: number;
  availability_check_ms: number;
  cache_hit: 0 | 1;
  wave_count: number;
  query_wave_2_ms: number;
  sequential_await_detected: 0 | 1;
  aggregate_compute_detected: 0 | 1;
  repeated_join_detected: 0 | 1;
  fallback_used: 0 | 1;
  rpc_removed: 0 | 1;
  snapshot_via?: string;
  worst_stage: string;
  worst_stage_ms: number;
};

export type StoresBrowseRegressionAlert = {
  query_wave_2_detected: 0 | 1;
  excessive_round_trips: 0 | 1;
  transport_regression: 0 | 1;
  aggregate_recompute_detected: 0 | 1;
  repeated_join_detected: 0 | 1;
  legacy_fallback_used: 0 | 1;
  reconnect_stale_overwrite: 0 | 1;
  duplicate_realtime_merge: 0 | 1;
  snapshot_version_regression: 0 | 1;
  ordering_filter_mismatch: 0 | 1;
  alerts: string[];
};

export function evaluateStoresBrowseRegressionGuards(
  row: StoresBrowseSnapshotBreakdown
): StoresBrowseRegressionAlert {
  const alerts: string[] = [];
  if (row.query_wave_2_ms > 0 && !row.fallback_used) alerts.push("query_wave_2_ms_gt_0");
  if (row.round_trips > 2 && !row.fallback_used) alerts.push("db_round_trips_gt_2");
  if (row.transport_ms > 400 && row.cache_hit === 0 && !row.fallback_used) {
    alerts.push("transport_ms_regression");
  }
  if (row.aggregate_compute_detected && !row.fallback_used) {
    alerts.push("aggregate_recompute_detected");
  }
  if (row.repeated_join_detected && !row.fallback_used) {
    alerts.push("repeated_store_category_review_join");
  }
  if (row.fallback_used) alerts.push("legacy_fallback_used");
  if (row.sequential_await_detected && !row.fallback_used) {
    alerts.push("sequential_await_detected");
  }

  const alert: StoresBrowseRegressionAlert = {
    query_wave_2_detected: row.query_wave_2_ms > 0 && !row.fallback_used ? 1 : 0,
    excessive_round_trips: row.round_trips > 2 && !row.fallback_used ? 1 : 0,
    transport_regression:
      row.transport_ms > 400 && row.cache_hit === 0 && !row.fallback_used ? 1 : 0,
    aggregate_recompute_detected: row.aggregate_compute_detected && !row.fallback_used ? 1 : 0,
    repeated_join_detected: row.repeated_join_detected && !row.fallback_used ? 1 : 0,
    legacy_fallback_used: row.fallback_used,
    reconnect_stale_overwrite: 0,
    duplicate_realtime_merge: 0,
    snapshot_version_regression: 0,
    ordering_filter_mismatch: 0,
    alerts,
  };

  if (alerts.length > 0) {
    // eslint-disable-next-line no-console -- regression guard
    console.warn("[stores-browse-regression-alert]", { ...alert, breakdown: row });
  }
  return alert;
}
