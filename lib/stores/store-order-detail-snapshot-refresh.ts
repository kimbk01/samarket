/**
 * Event-driven store order detail snapshot refresh (SOD1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshStoreOrderDetailSnapshotFromRpc } from "@/lib/stores/store-order-detail-snapshot";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

const refreshInflight = new Map<string, Promise<unknown>>();

export function scheduleStoreOrderDetailSnapshotRefresh(
  orderId: string,
  viewerUserId: string
): void {
  const oid = orderId.trim();
  const uid = viewerUserId.trim();
  if (!oid || !uid) return;
  const key = `${oid}:${uid}`;
  if (refreshInflight.has(key)) return;

  const flight = (async () => {
    const sb = tryGetSupabaseForStores();
    if (!sb) return null;
    return refreshStoreOrderDetailSnapshotFromRpc(sb as SupabaseClient<any>, uid, oid);
  })().finally(() => {
    if (refreshInflight.get(key) === flight) refreshInflight.delete(key);
  });

  refreshInflight.set(key, flight);
  void flight.catch(() => {});
}
