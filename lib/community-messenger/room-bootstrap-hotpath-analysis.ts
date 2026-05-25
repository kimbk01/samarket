/**
 * Structured hot-path analysis for room bootstrap — structural bottleneck diagnosis.
 */
import type { RoomBootstrapSnapshotBreakdown } from "@/lib/community-messenger/room-bootstrap-regression-guard";

export type BootstrapHotpathAnalysis = {
  route: string;
  room_id: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  payload_build_ms: number;
  participant_join_ms: number;
  profile_join_ms: number;
  unread_compute_ms: number;
  room_summary_compute_ms: number;
  cache_hit: 0 | 1;
  wave_count: number;
  query_wave_2_ms: number;
  rpc_removed: 0 | 1;
  sequential_await_detected: 0 | 1;
  aggregate_compute_detected: 0 | 1;
  embed_join_detected: 0 | 1;
  worst_stage: string;
  worst_stage_ms: number;
  structural_note?: string;
};

export function logBootstrapHotpathAnalysis(
  breakdown: RoomBootstrapSnapshotBreakdown,
  opts?: { structuralNote?: string }
): void {
  const analysis: BootstrapHotpathAnalysis = {
    route: breakdown.route,
    room_id: breakdown.room_id,
    total_ms: breakdown.total_ms,
    db_ms: breakdown.db_ms,
    round_trips: breakdown.round_trips,
    transport_ms: breakdown.transport_ms,
    payload_build_ms: breakdown.payload_build_ms,
    participant_join_ms: breakdown.participant_join_ms,
    profile_join_ms: breakdown.profile_join_ms,
    unread_compute_ms: breakdown.unread_compute_ms,
    room_summary_compute_ms: breakdown.room_summary_compute_ms,
    cache_hit: breakdown.cache_hit,
    wave_count: breakdown.wave_count,
    query_wave_2_ms: breakdown.query_wave_2_ms,
    rpc_removed: breakdown.rpc_removed,
    sequential_await_detected: breakdown.sequential_await_detected,
    aggregate_compute_detected: breakdown.aggregate_compute_detected,
    embed_join_detected: breakdown.embed_join_detected,
    worst_stage: breakdown.worst_stage,
    worst_stage_ms: breakdown.worst_stage_ms,
    structural_note: opts?.structuralNote,
  };
  // eslint-disable-next-line no-console -- required perf analysis output
  console.log("[bootstrap-hotpath-analysis]", analysis);
}

export type SnapshotRpcDesign = {
  route: string;
  rpc_name: string;
  expected_round_trips: number;
  replaces_queries: string[];
  snapshot_columns: string[];
  invalidation_events: string[];
};

let loggedDesign = false;

export function logRoomBootstrapSnapshotRpcDesignOnce(): void {
  if (loggedDesign) return;
  loggedDesign = true;
  const design: SnapshotRpcDesign = {
    route: "/api/community-messenger/rooms/[roomId]/bootstrap?mode=instant",
    rpc_name: "get_community_messenger_room_bootstrap_snapshot",
    expected_round_trips: 1,
    replaces_queries: [
      "community_messenger_rooms.maybeSingle",
      "community_messenger_participants + profiles embed",
      "community_messenger_participants viewer fallback",
      "community_messenger_messages recent limit",
    ],
    snapshot_columns: ["payload_json (room+participants+messages)", "snapshot_tier", "message_limit", "updated_at"],
    invalidation_events: [
      "cm_message_insert",
      "cm_message_update",
      "cm_message_delete",
      "cm_mark_read",
      "mark-all-read",
      "cm_participant_change",
      "trade/order state change",
      "attachment upload",
    ],
  };
  // eslint-disable-next-line no-console -- required design output
  console.log("[snapshot-rpc-design]", design);
}
