/**
 * CR1 chat rooms monolith hotpath analysis.
 */
import type { ChatRoomsSnapshotBreakdown } from "@/lib/chats/chat-rooms-snapshot-regression-guard";

export type ChatRoomsMonolithAnalysis = {
  route: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  payload_build_ms: number;
  rooms_fetch_ms: number;
  participant_join_ms: number;
  profile_join_ms: number;
  unread_compute_ms: number;
  room_summary_compute_ms: number;
  trade_meta_merge_ms: number;
  normalization_ms: number;
  ordering_compute_ms: number;
  cache_hit: 0 | 1;
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

export function logChatRoomsMonolithAnalysis(breakdown: ChatRoomsSnapshotBreakdown): void {
  const analysis: ChatRoomsMonolithAnalysis = {
    route: breakdown.route,
    total_ms: breakdown.total_ms,
    db_ms: breakdown.db_ms,
    round_trips: breakdown.round_trips,
    transport_ms: breakdown.transport_ms,
    payload_build_ms: breakdown.payload_build_ms,
    rooms_fetch_ms: breakdown.rooms_fetch_ms,
    participant_join_ms: breakdown.participant_join_ms,
    profile_join_ms: breakdown.profile_join_ms,
    unread_compute_ms: breakdown.unread_compute_ms,
    room_summary_compute_ms: breakdown.room_summary_compute_ms,
    trade_meta_merge_ms: breakdown.trade_meta_merge_ms,
    normalization_ms: breakdown.normalization_ms,
    ordering_compute_ms: breakdown.ordering_compute_ms,
    cache_hit: breakdown.cache_hit,
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
  // eslint-disable-next-line no-console -- CR1 required output
  console.log("[chat-rooms-monolith-analysis]", analysis);
}

let loggedDesign = false;

export function logChatRoomsSnapshotRpcDesignOnce(): void {
  if (loggedDesign) return;
  loggedDesign = true;
  // eslint-disable-next-line no-console -- CR1 design reference
  console.log("[chat-rooms-snapshot-rpc-design]", {
    route: "/api/chat/rooms",
    rpc_name: "get_chat_rooms_snapshot",
    expected_round_trips: 1,
    invalidation_events: [
      "message_insert",
      "message_update",
      "message_delete",
      "read_ack",
      "mark_all_read",
      "participant_change",
      "trade_item_change",
      "room_mute_archive",
      "reconnect",
      "silent_refresh",
    ],
  });
}
