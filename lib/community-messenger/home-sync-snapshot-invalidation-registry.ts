/**
 * Home-sync snapshot invalidation registry — client-safe (no server imports).
 * Auth exit wipe · critical rooms cache peek only import from here.
 */
import { COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP } from "@/lib/community-messenger/home-sync-room-caps";

const invalidatedUserIds = new Set<string>();

export function homeSyncCriticalRoomsCacheKey(userId: string, cap?: number): string {
  const c = cap ?? COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP;
  return `${userId.trim()}:critical:${Math.max(1, Math.floor(c))}`;
}

export function markHomeSyncSnapshotInvalidated(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  invalidatedUserIds.add(k);
}

export function peekHomeSyncSnapshotInvalidated(userId: string): boolean {
  return invalidatedUserIds.has(userId.trim());
}

export function clearHomeSyncSnapshotInvalidation(userId: string): void {
  invalidatedUserIds.delete(userId.trim());
}

/** auth exit — 이전 사용자 invalidation registry 잔존 방지 */
export function resetHomeSyncSnapshotInvalidationRegistry(): void {
  invalidatedUserIds.clear();
}
