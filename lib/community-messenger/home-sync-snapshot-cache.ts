/**
 * Home-sync snapshot invalidation — domain events → counter refresh.
 */
import { scheduleHomeSyncSnapshotRefresh } from "@/lib/community-messenger/home-sync-snapshot-refresh";
import { COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP } from "@/lib/community-messenger/home-sync-room-caps";

const invalidatedUserIds = new Set<string>();

export function homeSyncCriticalRoomsCacheKey(userId: string, cap?: number): string {
  const c = cap ?? COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP;
  return `${userId.trim()}:critical:${Math.max(1, Math.floor(c))}`;
}

/** CM message / read / participant change — schedule snapshot refresh. */
export function invalidateHomeSyncSnapshotCache(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  invalidatedUserIds.add(k);
  scheduleHomeSyncSnapshotRefresh(k);
}

export function peekHomeSyncSnapshotInvalidated(userId: string): boolean {
  return invalidatedUserIds.has(userId.trim());
}

export function clearHomeSyncSnapshotInvalidation(userId: string): void {
  invalidatedUserIds.delete(userId.trim());
}
