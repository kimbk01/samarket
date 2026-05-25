/**
 * Structured hot-path analysis for owner dashboard notifications.
 */
import type { OwnerDashboardNotificationsSnapshotBreakdown } from "@/lib/notifications/owner-dashboard-notifications-regression-guard";

export type OwnerNotificationsHotpathAnalysis = {
  route: string;
  total_ms: number;
  db_ms: number;
  round_trips: number;
  transport_ms: number;
  payload_build_ms: number;
  notification_fetch_ms: number;
  unread_compute_ms: number;
  order_merge_ms: number;
  inquiry_merge_ms: number;
  message_merge_ms: number;
  sort_compute_ms: number;
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

export function logOwnerNotificationsHotpathAnalysis(
  breakdown: OwnerDashboardNotificationsSnapshotBreakdown,
  opts?: { structuralNote?: string }
): void {
  const analysis: OwnerNotificationsHotpathAnalysis = {
    route: breakdown.route,
    total_ms: breakdown.total_ms,
    db_ms: breakdown.db_ms,
    round_trips: breakdown.round_trips,
    transport_ms: breakdown.transport_ms,
    payload_build_ms: breakdown.payload_build_ms,
    notification_fetch_ms: breakdown.notification_fetch_ms,
    unread_compute_ms: breakdown.unread_compute_ms,
    order_merge_ms: breakdown.order_merge_ms,
    inquiry_merge_ms: breakdown.inquiry_merge_ms,
    message_merge_ms: breakdown.message_merge_ms,
    sort_compute_ms: breakdown.sort_compute_ms,
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
  console.log("[owner-notifications-hotpath-analysis]", analysis);
}

let loggedDesign = false;

export function logOwnerDashboardNotificationsSnapshotRpcDesignOnce(): void {
  if (loggedDesign) return;
  loggedDesign = true;
  // eslint-disable-next-line no-console -- required design output
  console.log("[snapshot-rpc-design]", {
    route: "/api/me/notifications (owner_store_id | owner_store_commerce_unread_only)",
    rpc_name: "get_owner_dashboard_notifications_snapshot",
    expected_round_trips: 1,
    replaces_queries: [
      "count_notification_unread_segmented (owner_store_commerce)",
      "get_owner_store_commerce_notifications",
      "notifications 220-row client filter fallback",
    ],
    snapshot_columns: ["payload_json", "user_id", "store_id", "snapshot_kind", "updated_at"],
    invalidation_events: [
      "appendUserNotification",
      "notifyStoreOwner*",
      "PATCH mark read / delete",
      "mark_all_owner_store_commerce_read",
    ],
  });
}
