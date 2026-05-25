/**
 * Room bootstrap snapshot invalidation — domain events → counter refresh.
 */
import { invalidateRoomBootstrapRouteCacheForRoom } from "@/lib/community-messenger/server/room-bootstrap-route-cache";
import { scheduleRoomBootstrapSnapshotRefreshForRoom } from "@/lib/community-messenger/room-bootstrap-snapshot-refresh";

export function invalidateRoomBootstrapSnapshotCache(roomId: string, participantUserIds: string[]): void {
  const rid = roomId.trim();
  if (!rid) return;
  invalidateRoomBootstrapRouteCacheForRoom(rid);
  scheduleRoomBootstrapSnapshotRefreshForRoom(rid, participantUserIds);
}

export function invalidateRoomBootstrapSnapshotCacheForViewer(
  roomId: string,
  viewerUserId: string
): void {
  invalidateRoomBootstrapSnapshotCache(roomId, [viewerUserId]);
}

/** Mark-all-read: refresh bootstrap snapshots for every CM room the viewer participates in. */
export function invalidateAllRoomBootstrapSnapshotsForUser(userId: string, roomIds: string[]): void {
  const uid = userId.trim();
  if (!uid) return;
  for (const rid of roomIds) {
    const roomId = rid.trim();
    if (!roomId) continue;
    invalidateRoomBootstrapSnapshotCacheForViewer(roomId, uid);
  }
}
