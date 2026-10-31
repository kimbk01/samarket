/**
 * Event-driven owner dashboard notifications snapshot refresh.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshOwnerDashboardNotificationsSnapshotFromRpc } from "@/lib/notifications/owner-dashboard-notifications-snapshot";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { readOwnerHubStoreLookupMemory } from "@/lib/chats/owner-hub-store-lookup-cache";

const refreshInflight = new Map<string, Promise<unknown>>();

function flightKey(userId: string, storeId: string | null, kind: string, limit: number): string {
  return `${userId.trim()}:${storeId?.trim() || "anon"}:${kind}:${limit}`;
}

export function scheduleOwnerDashboardNotificationsSnapshotRefresh(
  userId: string,
  storeId: string | null,
  snapshotKind: string,
  limit = 200,
  cursor = ""
): void {
  const key = flightKey(userId, storeId, snapshotKind, limit);
  if (refreshInflight.has(key)) return;

  const flight = (async () => {
    const sb = tryCreateSupabaseServiceClient();
    if (!sb) return null;
    return refreshOwnerDashboardNotificationsSnapshotFromRpc(
      sb as SupabaseClient<any>,
      userId,
      storeId,
      snapshotKind,
      limit,
      cursor
    );
  })().finally(() => {
    if (refreshInflight.get(key) === flight) refreshInflight.delete(key);
  });

  refreshInflight.set(key, flight);
  void flight.catch(() => {});
}

export function scheduleOwnerDashboardNotificationsSnapshotRefreshForUser(
  userId: string,
  storeId?: string | null
): void {
  const uid = userId.trim();
  if (!uid) return;
  /**
   * 순서 5 E6 (docs/audit/supabase-request-fanout-full-root-cause-2026-11-01.md §12): 오너 알림 스냅샷은 오너 화면만 읽는다.
   * 이 인스턴스가 「매장 없음」을 막 확인한 사용자(허브 배지 기억, 신선 구간)면 미리 갱신하지 않는다.
   * 모르면(기억 없음·오래됨) 지금처럼 갱신. 읽는 쪽은 그대로 — 행이 없거나 오래되면 읽을 때 다시 만든다.
   */
  const lookup = readOwnerHubStoreLookupMemory(uid);
  const knownNoStore = lookup.hit && !lookup.stale && lookup.hubStore === null;
  if (!knownNoStore) {
    scheduleOwnerDashboardNotificationsSnapshotRefresh(uid, null, "owner_unread", 200);
  }
  const sid = storeId?.trim();
  if (sid) {
    scheduleOwnerDashboardNotificationsSnapshotRefresh(uid, sid, "owner_store", 200);
  }
}

/**
 * N-03 — Owner inbox read/mark-all: rebuild `owner_unread` + each touched store's `owner_store`
 * row before the API responds, so the client reload right after a read never serves the
 * pre-read snapshot (counter TTL 5s) and the `void` refresh is not cut by the serverless response.
 */
export async function refreshOwnerDashboardNotificationsSnapshotsNow(
  userId: string,
  storeIds: Iterable<string>
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return;
  const stores = [...new Set([...storeIds].map((s) => s.trim()).filter(Boolean))];
  await Promise.all([
    refreshOwnerDashboardNotificationsSnapshotFromRpc(sb as SupabaseClient<any>, uid, null, "owner_unread", 200, ""),
    ...stores.map((sid) =>
      refreshOwnerDashboardNotificationsSnapshotFromRpc(sb as SupabaseClient<any>, uid, sid, "owner_store", 200, "")
    ),
  ]).catch(() => {});
}
