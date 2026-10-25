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

/**
 * 1단계 결함 D-12 (2026-10-26): 읽음 처리 후 1:1 상대의 저장 스냅샷 행을 지운다(재계산 예약 없음).
 * 읽음 무효화가 읽은 사람 것만 지워 상대(보낸 사람)는 옛 읽음 위치가 든 저장 행을 계속 받았다(운영 DB 실측 03:45).
 * 상대가 다음에 방을 열 때 통합 RPC 로 새로 계산된다. 참가자가 정확히 1명 더 있는 방만 — 단체방은 그대로.
 * @returns 지운 상대 user_id (없으면 null)
 */
export async function deleteDirectPeerRoomBootstrapSnapshotRows(
  roomId: string,
  readerUserId: string
): Promise<string | null> {
  const rid = roomId.trim();
  const reader = readerUserId.trim();
  if (!rid || !reader) return null;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("community_messenger_participants")
    .select("user_id")
    .eq("room_id", rid)
    .neq("user_id", reader)
    .is("left_at", null)
    .limit(2);
  if (error || !Array.isArray(data) || data.length !== 1) return null;
  const peer = String((data[0] as { user_id?: unknown }).user_id ?? "").trim();
  if (!peer) return null;
  await sb.from(CM_ROOM_BOOTSTRAP_SNAPSHOT_TABLE).delete().eq("user_id", peer).eq("room_id", rid);
  return peer;
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
