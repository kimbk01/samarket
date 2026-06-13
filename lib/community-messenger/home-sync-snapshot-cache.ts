/**
 * Home-sync snapshot invalidation — domain events → counter refresh.
 * Server write path only; client auth exit는 invalidation-registry 를 import 한다.
 */
import { scheduleHomeSyncSnapshotRefresh } from "@/lib/community-messenger/home-sync-snapshot-refresh";
import {
  markHomeSyncSnapshotInvalidated,
  homeSyncCriticalRoomsCacheKey,
  peekHomeSyncSnapshotInvalidated,
  clearHomeSyncSnapshotInvalidation,
  resetHomeSyncSnapshotInvalidationRegistry,
} from "@/lib/community-messenger/home-sync-snapshot-invalidation-registry";

export {
  homeSyncCriticalRoomsCacheKey,
  peekHomeSyncSnapshotInvalidated,
  clearHomeSyncSnapshotInvalidation,
  resetHomeSyncSnapshotInvalidationRegistry,
};

/** CM message / read / participant change — schedule snapshot refresh. */
export function invalidateHomeSyncSnapshotCache(userId: string): void {
  markHomeSyncSnapshotInvalidated(userId);
  scheduleHomeSyncSnapshotRefresh(userId);
}
