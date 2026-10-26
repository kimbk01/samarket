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
import { keepAliveAfterResponse } from "@/lib/push/keep-alive-after-response";

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
  /**
   * 결함 F: `void` 만으로는 응답 뒤 서버리스 인스턴스가 얼면 갱신이 잘린다(keep-alive-after-response 주석).
   * 응답이 바로 끝나는 경로(보관 버튼 등)에서도 스냅샷 갱신이 끝까지 실행되게 한다.
   */
  keepAliveAfterResponse(flight.catch(() => null));
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
