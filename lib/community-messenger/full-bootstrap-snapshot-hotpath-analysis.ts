/**
 * FBT1 full bootstrap monolith hotpath analysis.
 */
import type { FullBootstrapSnapshotBreakdown } from "@/lib/community-messenger/full-bootstrap-snapshot-regression-guard";

export type FullBootstrapMonolithAnalysis = {
  route: string;
  tier: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  payload_build_ms: number;
  room_fetch_ms: number;
  participant_join_ms: number;
  profile_join_ms: number;
  unread_compute_ms: number;
  room_summary_compute_ms: number;
  attachment_enrich_ms: number;
  trade_context_merge_ms: number;
  order_context_merge_ms: number;
  notification_merge_ms: number;
  media_meta_merge_ms: number;
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

export function logFullBootstrapMonolithAnalysis(
  breakdown: FullBootstrapSnapshotBreakdown
): void {
  const analysis: FullBootstrapMonolithAnalysis = {
    route: breakdown.route,
    tier: breakdown.tier,
    total_ms: breakdown.total_ms,
    db_ms: breakdown.db_ms,
    round_trips: breakdown.round_trips,
    transport_ms: breakdown.transport_ms,
    payload_build_ms: breakdown.payload_build_ms,
    room_fetch_ms: breakdown.room_fetch_ms,
    participant_join_ms: breakdown.participant_join_ms,
    profile_join_ms: breakdown.profile_join_ms,
    unread_compute_ms: breakdown.unread_compute_ms,
    room_summary_compute_ms: breakdown.room_summary_compute_ms,
    attachment_enrich_ms: breakdown.attachment_enrich_ms,
    trade_context_merge_ms: breakdown.trade_context_merge_ms,
    order_context_merge_ms: breakdown.order_context_merge_ms,
    notification_merge_ms: breakdown.notification_merge_ms,
    media_meta_merge_ms: breakdown.media_meta_merge_ms,
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
  // eslint-disable-next-line no-console -- FBT1 required output
  console.log("[full-bootstrap-monolith-analysis]", analysis);
}

let loggedDesign = false;

export function logFullBootstrapSnapshotRpcDesignOnce(): void {
  if (loggedDesign) return;
  loggedDesign = true;
  // eslint-disable-next-line no-console -- FBT1 design reference
  console.log("[full-bootstrap-snapshot-rpc-design]", {
    route: "/api/community-messenger/bootstrap",
    rpc_name: "get_cm_bootstrap_full_snapshot",
    expected_round_trips: 1,
    tiers: ["critical", "full"],
    invalidation_events: [
      "message_insert",
      "read_ack",
      "mark_all_read",
      "participant_change",
      "trade_update",
      "order_update",
      "attachment_upload",
      "notification_update",
      "reconnect",
      "silent_refresh",
    ],
  });
}
