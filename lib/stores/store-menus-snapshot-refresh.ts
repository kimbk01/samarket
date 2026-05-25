/**
 * Event-driven store menus snapshot refresh.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshStoreMenusSnapshotFromRpc } from "@/lib/stores/store-menus-snapshot";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

const refreshInflight = new Map<string, Promise<unknown>>();

function flightKey(storeSlug: string, viewerUserId: string | null): string {
  return `${storeSlug.trim().toLowerCase()}:${viewerUserId?.trim() || "anon"}`;
}

export function scheduleStoreMenusSnapshotRefresh(storeSlug: string, viewerUserId: string | null): void {
  const key = flightKey(storeSlug, viewerUserId);
  if (refreshInflight.has(key)) return;

  const flight = (async () => {
    const sb = tryCreateSupabaseServiceClient();
    if (!sb) return null;
    return refreshStoreMenusSnapshotFromRpc(sb as SupabaseClient<any>, storeSlug, viewerUserId);
  })().finally(() => {
    if (refreshInflight.get(key) === flight) refreshInflight.delete(key);
  });

  refreshInflight.set(key, flight);
  void flight.catch(() => {});
}

/** Product/menu events — refresh anon snapshot + schedule viewer-specific rows lazily on read. */
export function scheduleStoreMenusSnapshotRefreshForSlug(storeSlug: string): void {
  const slug = storeSlug.trim();
  if (!slug) return;
  scheduleStoreMenusSnapshotRefresh(slug, null);
}
