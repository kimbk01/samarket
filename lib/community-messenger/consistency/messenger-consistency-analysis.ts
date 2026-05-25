/**
 * Structured consistency analysis for messenger unread / badge / list merge.
 */
import type { MessengerConsistencySurface } from "@/lib/community-messenger/consistency/messenger-consistency-version";
import { recordRealtimeBurstEvent } from "@/lib/ops/realtime-burst-analysis";

export type MessengerConsistencyAnalysis = {
  surface: MessengerConsistencySurface;
  room_id?: string;
  user_id_short?: string;
  event_type: string;
  source: string;
  snapshot_version?: number;
  realtime_version?: number;
  local_store_version?: number;
  unread_before?: number;
  unread_after?: number;
  badge_before?: number;
  badge_after?: number;
  optimistic_state?: string;
  server_state?: string;
  cross_tab_state?: string;
  reconnect_state?: string;
  stale_detected: 0 | 1;
  flicker_detected: 0 | 1;
  duplicate_event_detected: 0 | 1;
  desync_ms?: number;
  resolution_path: string;
};

function shouldLogAnalysis(): boolean {
  if (typeof process === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  return (
    process.env.NEXT_PUBLIC_CM_CONSISTENCY_DEBUG === "1" ||
    process.env.SAMARKET_MESSENGER_CONSISTENCY_LOG === "1"
  );
}

export function logMessengerConsistencyAnalysis(row: MessengerConsistencyAnalysis): void {
  if (shouldLogAnalysis()) {
    // eslint-disable-next-line no-console -- required MRC1 analysis output
    console.log("[messenger-consistency-analysis]", row);
  }
  if (typeof window !== "undefined") {
    recordRealtimeBurstEvent("event");
    if (row.duplicate_event_detected) recordRealtimeBurstEvent("duplicate");
    if (row.stale_detected) recordRealtimeBurstEvent("stale_discard");
    if ((row.desync_ms ?? 0) > 0) recordRealtimeBurstEvent("desync", row.desync_ms);
    if (row.unread_after != null) recordRealtimeBurstEvent("unread_final", row.unread_after);
    if (row.badge_after != null) recordRealtimeBurstEvent("badge_final", row.badge_after);
    if (!row.stale_detected && !row.duplicate_event_detected) recordRealtimeBurstEvent("applied");
  }
}
