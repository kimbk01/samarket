/**
 * Event-driven owner store orders list snapshot refresh (OOL1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshOwnerStoreOrdersListSnapshotFromRpc } from "@/lib/delivery/owner/owner-store-orders-list-snapshot";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

const refreshInflight = new Map<string, Promise<unknown>>();

function flightKey(storeId: string, ownerUserId: string): string {
  return `${storeId.trim()}:${ownerUserId.trim()}`;
}

async function resolveStoreOwnerUserId(storeId: string): Promise<string | null> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return null;
  const { data, error } = await sb.from("stores").select("owner_user_id").eq("id", storeId.trim()).maybeSingle();
  if (error) return null;
  const uid = String(data?.owner_user_id ?? "").trim();
  return uid || null;
}

export function scheduleOwnerStoreOrdersListSnapshotRefresh(
  storeId: string,
  ownerUserId: string | null
): void {
  const sid = storeId.trim();
  if (!sid) return;

  const run = (uid: string | null) => {
    if (!uid) return;
    const key = flightKey(sid, uid);
    if (refreshInflight.has(key)) return;

    const flight = (async () => {
      const sb = tryCreateSupabaseServiceClient();
      if (!sb) return null;
      return refreshOwnerStoreOrdersListSnapshotFromRpc(sb as SupabaseClient<any>, sid, uid);
    })().finally(() => {
      if (refreshInflight.get(key) === flight) refreshInflight.delete(key);
    });

    refreshInflight.set(key, flight);
    void flight.catch(() => {});
  };

  const uid = ownerUserId?.trim();
  if (uid) {
    run(uid);
    return;
  }
  void resolveStoreOwnerUserId(sid).then(run);
}

export function invalidateOwnerStoreOrdersListSnapshot(
  storeId: string,
  ownerUserId?: string | null
): void {
  scheduleOwnerStoreOrdersListSnapshotRefresh(storeId, ownerUserId ?? null);
}
