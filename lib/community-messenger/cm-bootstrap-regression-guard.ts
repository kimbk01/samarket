/**
 * CMB1 bootstrap regression guards.
 */
import type { CmBootstrapMonolithAnalysis } from "@/lib/community-messenger/cm-bootstrap-monolith-hotpath-analysis";

export type CmBootstrapSnapshotBreakdown = {
  route: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  payload_build_ms: number;
  room_list_fetch_ms: number;
  participant_join_ms: number;
  profile_join_ms: number;
  unread_compute_ms: number;
  room_summary_compute_ms: number;
  notification_merge_ms: number;
  silent_delta_merge_ms: number;
  bootstrap_cache_ms: number;
  cache_hit: 0 | 1;
  wave_count: number;
  query_wave_2_ms: number;
  sequential_await_detected: 0 | 1;
  aggregate_compute_detected: 0 | 1;
  repeated_join_detected: 0 | 1;
  fallback_used: 0 | 1;
  reconnect_path_used: 0 | 1;
  rpc_removed: 0 | 1;
  snapshot_via?: string;
  worst_stage: string;
  worst_stage_ms: number;
};

export type CmBootstrapRegressionAlert = {
  query_wave_2_detected: 0 | 1;
  excessive_round_trips: 0 | 1;
  transport_regression: 0 | 1;
  aggregate_recompute_detected: 0 | 1;
  repeated_join_detected: 0 | 1;
  legacy_fallback_used: 0 | 1;
  sequential_await_detected: 0 | 1;
  reconnect_stale_overwrite: 0 | 1;
  duplicate_realtime_merge: 0 | 1;
  snapshot_version_regression: 0 | 1;
  alerts: string[];
};

export function evaluateCmBootstrapRegressionGuards(
  row: CmBootstrapSnapshotBreakdown
): CmBootstrapRegressionAlert {
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
    alerts.push("repeated_participant_profile_join");
  }
  if (row.fallback_used) alerts.push("legacy_fallback_used");
  if (row.sequential_await_detected && !row.fallback_used) {
    alerts.push("sequential_await_detected");
  }
  if (row.reconnect_path_used && row.fallback_used) alerts.push("reconnect_fallback_bootstrap");

  const alert: CmBootstrapRegressionAlert = {
    query_wave_2_detected: row.query_wave_2_ms > 0 && !row.fallback_used ? 1 : 0,
    excessive_round_trips: row.round_trips > 2 && !row.fallback_used ? 1 : 0,
    transport_regression:
      row.transport_ms > 400 && row.cache_hit === 0 && !row.fallback_used ? 1 : 0,
    aggregate_recompute_detected: row.aggregate_compute_detected && !row.fallback_used ? 1 : 0,
    repeated_join_detected: row.repeated_join_detected && !row.fallback_used ? 1 : 0,
    legacy_fallback_used: row.fallback_used,
    sequential_await_detected: row.sequential_await_detected && !row.fallback_used ? 1 : 0,
    reconnect_stale_overwrite: 0,
    duplicate_realtime_merge: 0,
    snapshot_version_regression: 0,
    alerts,
  };

  if (alerts.length > 0) {
    // eslint-disable-next-line no-console -- regression guard
    console.warn("[cm-bootstrap-regression-alert]", { ...alert, breakdown: row });
  }
  return alert;
}

export function breakdownToMonolithAnalysis(
  b: CmBootstrapSnapshotBreakdown
): CmBootstrapMonolithAnalysis {
  return {
    route: b.route,
    total_ms: b.total_ms,
    db_ms: b.db_ms,
    round_trips: b.round_trips,
    transport_ms: b.transport_ms,
    payload_build_ms: b.payload_build_ms,
    room_list_fetch_ms: b.room_list_fetch_ms,
    participant_join_ms: b.participant_join_ms,
    profile_join_ms: b.profile_join_ms,
    unread_compute_ms: b.unread_compute_ms,
    room_summary_compute_ms: b.room_summary_compute_ms,
    notification_merge_ms: b.notification_merge_ms,
    silent_delta_merge_ms: b.silent_delta_merge_ms,
    bootstrap_cache_ms: b.bootstrap_cache_ms,
    wave_count: b.wave_count,
    query_wave_2_ms: b.query_wave_2_ms,
    sequential_await_detected: b.sequential_await_detected,
    aggregate_compute_detected: b.aggregate_compute_detected,
    repeated_join_detected: b.repeated_join_detected,
    fallback_used: b.fallback_used,
    reconnect_path_used: b.reconnect_path_used,
    worst_stage: b.worst_stage,
    worst_stage_ms: b.worst_stage_ms,
  };
}
