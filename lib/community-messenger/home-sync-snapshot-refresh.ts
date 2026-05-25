/**
 * Event-driven home-sync snapshot refresh — write path on mutations.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  refreshHomeSyncSnapshotFromRpc,
  type HomeSyncSnapshotRow,
} from "@/lib/community-messenger/home-sync-snapshot";
import { COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP } from "@/lib/community-messenger/home-sync-room-caps";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

const refreshInflight = new Map<string, Promise<HomeSyncSnapshotRow | null>>();

export function scheduleHomeSyncSnapshotRefresh(userId: string): void {
  const uid = userId.trim();
  if (!uid || refreshInflight.has(uid)) return;

  const flight = (async (): Promise<HomeSyncSnapshotRow | null> => {
    const sb = tryCreateSupabaseServiceClient();
    if (!sb) return null;
    return refreshHomeSyncSnapshotFromRpc(
      sb as SupabaseClient<any>,
      uid,
      COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP
    );
  })().finally(() => {
    if (refreshInflight.get(uid) === flight) refreshInflight.delete(uid);
  });

  refreshInflight.set(uid, flight);
  void flight.catch(() => {});
}

export async function refreshHomeSyncSnapshotNow(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<HomeSyncSnapshotRow | null> {
  const uid = userId.trim();
  if (!uid) return null;
  return refreshHomeSyncSnapshotFromRpc(
    sbAny,
    uid,
    COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP
  );
}
