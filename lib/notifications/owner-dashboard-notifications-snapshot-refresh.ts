/**
 * Event-driven owner dashboard notifications snapshot refresh.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshOwnerDashboardNotificationsSnapshotFromRpc } from "@/lib/notifications/owner-dashboard-notifications-snapshot";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

const refreshInflight = new Map<string, Promise<unknown>>();

function flightKey(userId: string, storeId: string | null, kind: string, limit: number): string {
  return `${userId.trim()}:${storeId?.trim() || "anon"}:${kind}:${limit}`;
}

export function scheduleOwnerDashboardNotificationsSnapshotRefresh(
  userId: string,
  storeId: string | null,
  snapshotKind: string,
  limit = 200,
  cursor = ""
): void {
  const key = flightKey(userId, storeId, snapshotKind, limit);
  if (refreshInflight.has(key)) return;

  const flight = (async () => {
    const sb = tryCreateSupabaseServiceClient();
    if (!sb) return null;
    return refreshOwnerDashboardNotificationsSnapshotFromRpc(
      sb as SupabaseClient<any>,
      userId,
      storeId,
      snapshotKind,
      limit,
      cursor
    );
  })().finally(() => {
    if (refreshInflight.get(key) === flight) refreshInflight.delete(key);
  });

  refreshInflight.set(key, flight);
  void flight.catch(() => {});
}

export function scheduleOwnerDashboardNotificationsSnapshotRefreshForUser(
  userId: string,
  storeId?: string | null
): void {
  const uid = userId.trim();
  if (!uid) return;
  scheduleOwnerDashboardNotificationsSnapshotRefresh(uid, null, "owner_unread", 200);
  const sid = storeId?.trim();
  if (sid) {
    scheduleOwnerDashboardNotificationsSnapshotRefresh(uid, sid, "owner_store", 200);
  }
}
