/**
 * Room bootstrap snapshot invalidation — domain events → in-memory route cache.
 *
 * R2-c (docs/audit/messenger-2026-10-27-r2-request-fanout-plan.md): room entry no longer reads the
 * precomputed `community_messenger_room_bootstrap_snapshots` row (unified RPC every entry), so events
 * no longer delete rows or schedule a rebuild per participant — only the per-instance route cache.
 */
import { invalidateRoomBootstrapRouteCacheForRoom } from "@/lib/community-messenger/server/room-bootstrap-route-cache";

export function invalidateRoomBootstrapSnapshotCache(roomId: string, participantUserIds: string[]): void {
  const rid = roomId.trim();
  if (!rid) return;
  void participantUserIds;
  invalidateRoomBootstrapRouteCacheForRoom(rid);
}

export function invalidateRoomBootstrapSnapshotCacheForViewer(
  roomId: string,
  viewerUserId: string
): void {
  invalidateRoomBootstrapSnapshotCache(roomId, [viewerUserId]);
}

/** Mark-all-read: drop the route cache for every CM room the viewer participates in. */
export function invalidateAllRoomBootstrapSnapshotsForUser(userId: string, roomIds: string[]): void {
  const uid = userId.trim();
  if (!uid) return;
  for (const rid of roomIds) {
    const roomId = rid.trim();
    if (!roomId) continue;
    invalidateRoomBootstrapSnapshotCacheForViewer(roomId, uid);
  }
}
