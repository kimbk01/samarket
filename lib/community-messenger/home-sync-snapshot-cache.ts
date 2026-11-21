/**
 * Home-sync snapshot invalidation — domain events → counter refresh.
 * Server write path only; client auth exit는 invalidation-registry 를 import 한다.
 */
import { scheduleHomeSyncSnapshotRefresh } from "@/lib/community-messenger/home-sync-snapshot-refresh";
import { enqueueMessengerSnapshotDirty } from "@/lib/community-messenger/messenger-snapshot-dirty";
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
export function invalidateHomeSyncSnapshotCache(userId: string, opts?: { lazySnapshot?: boolean }): void {
  markHomeSyncSnapshotInvalidated(userId);
  /** 2026-11-21 보내기 2단계 — lazySnapshot 이면 「바뀜 표시」만(묶음) · 읽는 쪽이 즉시 다시 만든다 */
  if (opts?.lazySnapshot === true) enqueueMessengerSnapshotDirty(userId, "home");
  else scheduleHomeSyncSnapshotRefresh(userId);
}
