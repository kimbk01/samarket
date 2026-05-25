/**
 * Event-driven room bootstrap snapshot refresh.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshRoomBootstrapSnapshotFromRpc } from "@/lib/community-messenger/room-bootstrap-snapshot";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

const refreshInflight = new Map<string, Promise<unknown>>();

function flightKey(userId: string, roomId: string, messageLimit: number): string {
  return `${userId.trim()}:${roomId.trim()}:${messageLimit}`;
}

export function scheduleRoomBootstrapSnapshotRefresh(
  userId: string,
  roomId: string,
  messageLimit = 24
): void {
  const key = flightKey(userId, roomId, messageLimit);
  if (refreshInflight.has(key)) return;

  const flight = (async () => {
    const sb = tryCreateSupabaseServiceClient();
    if (!sb) return null;
    return refreshRoomBootstrapSnapshotFromRpc(sb as SupabaseClient<any>, userId, roomId, messageLimit);
  })().finally(() => {
    if (refreshInflight.get(key) === flight) refreshInflight.delete(key);
  });

  refreshInflight.set(key, flight);
  void flight.catch(() => {});
}

/** Refresh all common message limits for a room (event invalidation). */
export function scheduleRoomBootstrapSnapshotRefreshForRoom(roomId: string, participantUserIds: string[]): void {
  const rid = roomId.trim();
  if (!rid) return;
  const limits = [24, 30];
  for (const uid of participantUserIds) {
    const k = uid.trim();
    if (!k) continue;
    for (const lim of limits) {
      scheduleRoomBootstrapSnapshotRefresh(k, rid, lim);
    }
  }
}
