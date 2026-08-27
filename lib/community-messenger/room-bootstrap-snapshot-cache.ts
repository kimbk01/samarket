/**
 * Room bootstrap snapshot invalidation — domain events → counter refresh.
 */
import { CM_ROOM_BOOTSTRAP_SNAPSHOT_TABLE } from "@/lib/community-messenger/room-bootstrap-snapshot-counter";
import { invalidateRoomBootstrapRouteCacheForRoom } from "@/lib/community-messenger/server/room-bootstrap-route-cache";
import { scheduleRoomBootstrapSnapshotRefreshForRoom } from "@/lib/community-messenger/room-bootstrap-snapshot-refresh";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

function deleteRoomBootstrapSnapshotCountersForRoom(roomId: string, participantUserIds: string[]): void {
  const rid = roomId.trim();
  if (!rid) return;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return;
  const userIds = participantUserIds.map((id) => id.trim()).filter(Boolean);
  if (!userIds.length) return;
  void (async () => {
    for (const userId of userIds) {
      await sb
        .from(CM_ROOM_BOOTSTRAP_SNAPSHOT_TABLE)
        .delete()
        .eq("user_id", userId)
        .eq("room_id", rid);
    }
  })().catch(() => {});
}

export function invalidateRoomBootstrapSnapshotCache(roomId: string, participantUserIds: string[]): void {
  const rid = roomId.trim();
  if (!rid) return;
  invalidateRoomBootstrapRouteCacheForRoom(rid);
  deleteRoomBootstrapSnapshotCountersForRoom(rid, participantUserIds);
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
