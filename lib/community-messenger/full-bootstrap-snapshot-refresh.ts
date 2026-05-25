/**
 * Event-driven full bootstrap snapshot refresh (FBT1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshFullBootstrapSnapshotFromRpc } from "@/lib/community-messenger/full-bootstrap-snapshot";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

const refreshInflight = new Map<string, Promise<unknown>>();

export function scheduleFullBootstrapSnapshotRefresh(
  userId: string,
  tier: "full" | "critical"
): void {
  const uid = userId.trim();
  if (!uid) return;
  const key = `${uid}:${tier}`;
  if (refreshInflight.has(key)) return;

  const flight = (async () => {
    const sb = tryGetSupabaseForStores();
    if (!sb) return null;
    return refreshFullBootstrapSnapshotFromRpc(sb as SupabaseClient<any>, uid, tier);
  })().finally(() => {
    if (refreshInflight.get(key) === flight) refreshInflight.delete(key);
  });

  refreshInflight.set(key, flight);
  void flight.catch(() => {});
}
