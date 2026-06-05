/**
 * Messenger realtime consistency regression guards (MRC1).
 */
import type { MessengerConsistencyAnalysis } from "@/lib/community-messenger/consistency/messenger-consistency-analysis";
import { recordLongSessionEvent } from "@/lib/ops/long-session-stability";

const REGRESSION_ALERT_DEDUPE_MS = 30_000;
const recentRegressionAlertKeys = new Map<string, number>();

function shouldEmitRegressionAlert(signature: string): boolean {
  const now = Date.now();
  const lastAt = recentRegressionAlertKeys.get(signature) ?? 0;
  if (now - lastAt < REGRESSION_ALERT_DEDUPE_MS) return false;
  recentRegressionAlertKeys.set(signature, now);
  if (recentRegressionAlertKeys.size > 200) {
    for (const [key, at] of recentRegressionAlertKeys) {
      if (now - at > REGRESSION_ALERT_DEDUPE_MS) recentRegressionAlertKeys.delete(key);
    }
  }
  return true;
}

export type MessengerConsistencyRegressionAlert = {
  stale_snapshot_overwrote_realtime: 0 | 1;
  unread_resurrected_after_read: 0 | 1;
  badge_room_mismatch: 0 | 1;
  cross_tab_desync: 0 | 1;
  duplicate_realtime_event: 0 | 1;
  reconnect_legacy_fallback: 0 | 1;
  snapshot_version_regression: 0 | 1;
  mark_all_read_resurrected_unread: 0 | 1;
  active_room_unread_restored: 0 | 1;
  alerts: string[];
};

export function evaluateMessengerConsistencyRegressionGuards(
  row: MessengerConsistencyAnalysis
): MessengerConsistencyRegressionAlert {
  const alerts: string[] = [];

  if (row.stale_detected) alerts.push("stale_snapshot_overwrote_realtime");
  if (
    row.resolution_path.includes("resurrect") ||
    (row.unread_before === 0 && (row.unread_after ?? 0) > 0 && row.optimistic_state === "read")
  ) {
    alerts.push("unread_resurrected_after_read");
  }
  if (row.flicker_detected) alerts.push("badge_flicker");
  if ((row.desync_ms ?? 0) > 500) alerts.push("cross_tab_desync_ms");
  if (row.duplicate_event_detected) alerts.push("duplicate_realtime_event_applied");
  if (row.reconnect_state === "legacy_fallback") alerts.push("reconnect_triggered_legacy_fallback");
  if (row.resolution_path === "snapshot_version_regression") alerts.push("snapshot_version_regression");
  if (row.event_type === "mark_all_read" && (row.unread_after ?? 0) > 0) {
    alerts.push("mark_all_read_resurrected_unread");
  }
  if (row.event_type === "active_room" && (row.unread_after ?? 0) > 0) {
    alerts.push("active_room_unread_restored");
  }

  const alert: MessengerConsistencyRegressionAlert = {
    stale_snapshot_overwrote_realtime: row.stale_detected,
    unread_resurrected_after_read: alerts.includes("unread_resurrected_after_read") ? 1 : 0,
    badge_room_mismatch: row.flicker_detected,
    cross_tab_desync: (row.desync_ms ?? 0) > 500 ? 1 : 0,
    duplicate_realtime_event: row.duplicate_event_detected,
    reconnect_legacy_fallback: row.reconnect_state === "legacy_fallback" ? 1 : 0,
    snapshot_version_regression: row.resolution_path === "snapshot_version_regression" ? 1 : 0,
    mark_all_read_resurrected_unread:
      row.event_type === "mark_all_read" && (row.unread_after ?? 0) > 0 ? 1 : 0,
    active_room_unread_restored:
      row.event_type === "active_room" && (row.unread_after ?? 0) > 0 ? 1 : 0,
    alerts,
  };

  if (alerts.length > 0) {
    const signature = `${row.surface}:${row.room_id ?? "global"}:${alerts.slice().sort().join("|")}`;
    if (!shouldEmitRegressionAlert(signature)) {
      return alert;
    }
    if (typeof window !== "undefined") {
      recordLongSessionEvent("regression_alert");
    }
    // eslint-disable-next-line no-console -- regression guard
    console.warn("[messenger-consistency-regression-alert]", { ...alert, analysis: row });
  }
  return alert;
}
