/**
 * Event-driven delivery summary snapshot refresh.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshDeliverySummarySnapshotFromRpc } from "@/lib/stores/delivery-summary-snapshot";
import { DELIVERY_SUMMARY_DEFAULT_SCOPE } from "@/lib/stores/delivery-summary-snapshot-counter";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

const refreshInflight = new Map<string, Promise<unknown>>();

function flightKey(storeId: string, ownerUserId: string | null, scope: string): string {
  return `${storeId.trim()}:${ownerUserId?.trim() || "anon"}:${scope}`;
}

async function resolveStoreOwnerUserId(storeId: string): Promise<string | null> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return null;
  const { data, error } = await sb.from("stores").select("owner_user_id").eq("id", storeId.trim()).maybeSingle();
  if (error) return null;
  const uid = String(data?.owner_user_id ?? "").trim();
  return uid || null;
}

export function scheduleDeliverySummarySnapshotRefresh(
  storeId: string,
  ownerUserId: string | null,
  summaryScope = DELIVERY_SUMMARY_DEFAULT_SCOPE
): void {
  const sid = storeId.trim();
  if (!sid) return;

  const run = (uid: string | null) => {
    if (!uid) return;
    const key = flightKey(sid, uid, summaryScope);
    if (refreshInflight.has(key)) return;

    const flight = (async () => {
      const sb = tryCreateSupabaseServiceClient();
      if (!sb) return null;
      return refreshDeliverySummarySnapshotFromRpc(
        sb as SupabaseClient<any>,
        sid,
        uid,
        summaryScope
      );
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
