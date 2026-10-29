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



/**
 * v4 PERF-22 — `round_trips` 는 이제 요청 단위 **실제** DB 왕복 수(`countSupabaseRoundTrips`)다.
 * 예전 `> 2` 는 고정값 1 을 전제로 한 값이라 실측(실시간 순위·hydrate·서비스 영역·인기·삽입 메타 포함)에서는
 * 매 요청 경보가 되어 가드가 무의미하다. 2026-10-29 로컬 실측(W2 적용 후 응답 기준 31~32회)을 예산으로 두고
 * 그보다 늘어나면 회귀로 경보한다.
 */
export const STORES_BROWSE_ROUND_TRIP_BUDGET = 32;

export function evaluateStoresBrowseRegressionGuards(

  row: StoresBrowseSnapshotBreakdown

): StoresBrowseRegressionAlert {

  const alerts: string[] = [];

  if (row.query_wave_2_ms > 0 && !row.fallback_used) alerts.push("query_wave_2_ms_gt_0");

  if (row.round_trips > STORES_BROWSE_ROUND_TRIP_BUDGET && !row.fallback_used) {
    alerts.push("db_round_trips_over_budget");
  }

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

    excessive_round_trips: row.round_trips > STORES_BROWSE_ROUND_TRIP_BUDGET && !row.fallback_used ? 1 : 0,

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


