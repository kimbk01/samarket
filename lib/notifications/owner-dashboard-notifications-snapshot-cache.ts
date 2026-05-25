/**
 * Owner dashboard notifications snapshot invalidation.
 */
import { scheduleOwnerDashboardNotificationsSnapshotRefreshForUser } from "@/lib/notifications/owner-dashboard-notifications-snapshot-refresh";

export function invalidateOwnerDashboardNotificationsSnapshotCache(
  userId: string,
  storeId?: string | null
): void {
  const uid = userId.trim();
  if (!uid) return;
  scheduleOwnerDashboardNotificationsSnapshotRefreshForUser(uid, storeId ?? null);
}
