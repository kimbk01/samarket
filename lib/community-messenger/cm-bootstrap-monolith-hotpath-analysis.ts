/**
 * CMB1 bootstrap monolith hotpath analysis.
 */
import type { CmBootstrapSnapshotBreakdown } from "@/lib/community-messenger/cm-bootstrap-regression-guard";

export type CmBootstrapMonolithAnalysis = {
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
  wave_count: number;
  query_wave_2_ms: number;
  sequential_await_detected: 0 | 1;
  aggregate_compute_detected: 0 | 1;
  repeated_join_detected: 0 | 1;
  fallback_used: 0 | 1;
  reconnect_path_used: 0 | 1;
  worst_stage: string;
  worst_stage_ms: number;
};

export function logCmBootstrapMonolithAnalysis(
  breakdown: CmBootstrapSnapshotBreakdown
): void {
  const analysis: CmBootstrapMonolithAnalysis = {
    route: breakdown.route,
    total_ms: breakdown.total_ms,
    db_ms: breakdown.db_ms,
    round_trips: breakdown.round_trips,
    transport_ms: breakdown.transport_ms,
    payload_build_ms: breakdown.payload_build_ms,
    room_list_fetch_ms: breakdown.room_list_fetch_ms,
    participant_join_ms: breakdown.participant_join_ms,
    profile_join_ms: breakdown.profile_join_ms,
    unread_compute_ms: breakdown.unread_compute_ms,
    room_summary_compute_ms: breakdown.room_summary_compute_ms,
    notification_merge_ms: breakdown.notification_merge_ms,
    silent_delta_merge_ms: breakdown.silent_delta_merge_ms,
    bootstrap_cache_ms: breakdown.bootstrap_cache_ms,
    wave_count: breakdown.wave_count,
    query_wave_2_ms: breakdown.query_wave_2_ms,
    sequential_await_detected: breakdown.sequential_await_detected,
    aggregate_compute_detected: breakdown.aggregate_compute_detected,
    repeated_join_detected: breakdown.repeated_join_detected,
    fallback_used: breakdown.fallback_used,
    reconnect_path_used: breakdown.reconnect_path_used,
    worst_stage: breakdown.worst_stage,
    worst_stage_ms: breakdown.worst_stage_ms,
  };
  // eslint-disable-next-line no-console -- CMB1 required output
  console.log("[cm-bootstrap-monolith-analysis]", analysis);
}

let loggedDesign = false;

export function logCmBootstrapSnapshotRpcDesignOnce(): void {
  if (loggedDesign) return;
  loggedDesign = true;
  // eslint-disable-next-line no-console -- CMB1 design reference
  console.log("[cm-bootstrap-snapshot-rpc-design]", {
    route: "/api/community-messenger/bootstrap",
    rpc_name: "get_cm_bootstrap_critical_snapshot",
    expected_round_trips: 1,
    invalidation_events: [
      "message_insert",
      "message_update",
      "read_ack",
      "mark_all_read",
      "participant_change",
      "room_mute_archive",
      "notification_update",
      "reconnect",
    ],
  });
}
