/**
 * Event-driven stores browse snapshot refresh (SB1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshStoresBrowseSnapshotFromRpc } from "@/lib/stores/stores-browse-snapshot";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

const refreshInflight = new Map<string, Promise<unknown>>();

export function scheduleStoresBrowseSnapshotRefresh(primarySlug: string): void {
  const primary = primarySlug.trim().toLowerCase();
  if (!primary) return;
  if (refreshInflight.has(primary)) return;

  const flight = (async () => {
    const sb = tryGetSupabaseForStores();
    if (!sb) return null;
    return refreshStoresBrowseSnapshotFromRpc(sb as SupabaseClient<any>, primary, "all");
  })().finally(() => {
    if (refreshInflight.get(primary) === flight) refreshInflight.delete(primary);
  });

  refreshInflight.set(primary, flight);
  void flight.catch(() => {});
}
