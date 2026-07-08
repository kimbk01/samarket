/**
 * Structured hot-path analysis for home-sync — structural bottleneck diagnosis.
 */
import type { HomeSyncSnapshotBreakdown } from "@/lib/community-messenger/home-sync-regression-guard";
import {
  homeSyncObsFromBreakdown,
  setLastHomeSyncRouteObservability,
} from "@/lib/community-messenger/home-sync-route-observability";

export type RouteHotpathAnalysis = {
  route: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  serialization_ms: number;
  payload_build_ms: number;
  cache_hit: 0 | 1;
  wave_count: number;
  query_wave_2_ms: number;
  rpc_removed: 0 | 1;
  cache_hit_reason?: string;
  sequential_await_detected: 0 | 1;
  embed_join_detected: 0 | 1;
  aggregate_compute_detected: 0 | 1;
  worst_stage: string;
  worst_stage_ms: number;
  structural_note?: string;
};

export function logRouteHotpathAnalysis(
  breakdown: HomeSyncSnapshotBreakdown,
  opts?: { tier?: string; structuralNote?: string }
): void {
  const analysis: RouteHotpathAnalysis = {
    route: `/api/community-messenger/home-sync${opts?.tier ? `?tier=${opts.tier}` : ""}`,
    total_ms: breakdown.total_ms,
    db_ms: breakdown.db_ms,
    round_trips: breakdown.round_trips,
    transport_ms: breakdown.transport_ms,
    serialization_ms: breakdown.serialization_ms,
    payload_build_ms: breakdown.payload_build_ms,
    cache_hit: breakdown.cache_hit,
    wave_count: breakdown.wave_count,
    query_wave_2_ms: breakdown.query_wave_2_ms,
    rpc_removed: breakdown.rpc_removed,
    cache_hit_reason: breakdown.cache_hit_reason,
    sequential_await_detected: breakdown.sequential_await_detected,
    embed_join_detected: breakdown.embed_join_detected,
    aggregate_compute_detected: breakdown.aggregate_compute_detected,
    worst_stage: breakdown.worst_stage,
    worst_stage_ms: breakdown.worst_stage_ms,
    structural_note: opts?.structuralNote,
  };
  // eslint-disable-next-line no-console -- required perf analysis output
  console.log("[route-hotpath-analysis]", analysis);
  setLastHomeSyncRouteObservability(homeSyncObsFromBreakdown(breakdown));
}

export type SnapshotRpcDesign = {
  route: string;
  rpc_name: string;
  expected_round_trips: number;
  replaces_queries: string[];
  removes_transport_ms: string;
  snapshot_columns: string[];
  invalidation_events: string[];
};

export function logSnapshotRpcDesignOnce(): void {
  if (loggedDesign) return;
  loggedDesign = true;
  const design: SnapshotRpcDesign = {
    route: "/api/community-messenger/home-sync?tier=critical",
    rpc_name: "get_community_messenger_home_sync_snapshot",
    expected_round_trips: 1,
    replaces_queries: [
      "community_messenger_bootstrap_my_room_ids",
      "community_messenger_bootstrap_rooms / rooms.in",
      "community_messenger_participants.in",
      "profiles.in (labels)",
      "home_sync_hs5_unread_legacy_bundle",
      "product_chats lifecycle (trade)",
      "store_orders + store_order_events lifecycle (delivery)",
    ],
    removes_transport_ms: "3-4 PostgREST RTT waves → 1 PK select or 1 unified RPC",
    snapshot_columns: ["payload_json (lite_bundle + hs5 + commerce_lifecycle)", "tier", "room_cap", "updated_at"],
    invalidation_events: [
      "cm_message_insert",
      "cm_mark_read",
      "cm_participant_pin_mute_archive",
      "trade_pc_unread_change",
      "trade_pc_lifecycle_change",
      "store_order_lifecycle_change",
      "friend_accept (full tier)",
    ],
  };
  // eslint-disable-next-line no-console -- required design output
  console.log("[snapshot-rpc-design]", design);
}

let loggedDesign = false;
