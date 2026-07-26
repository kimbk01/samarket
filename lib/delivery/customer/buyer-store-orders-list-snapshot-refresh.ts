/**
 * Event-driven buyer store orders list snapshot refresh (SOL1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshBuyerStoreOrdersListSnapshotFromRpc } from "@/lib/delivery/customer/buyer-store-orders-list-snapshot";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

const refreshInflight = new Map<string, Promise<unknown>>();

export function scheduleBuyerStoreOrdersListSnapshotRefresh(buyerUserId: string): void {
  const uid = buyerUserId.trim();
  if (!uid) return;
  if (refreshInflight.has(uid)) return;

  const flight = (async () => {
    const sb = tryGetSupabaseForStores();
    if (!sb) return null;
    return refreshBuyerStoreOrdersListSnapshotFromRpc(sb as SupabaseClient<any>, uid);
  })().finally(() => {
    if (refreshInflight.get(uid) === flight) refreshInflight.delete(uid);
  });

  refreshInflight.set(uid, flight);
  void flight.catch(() => {});
}
