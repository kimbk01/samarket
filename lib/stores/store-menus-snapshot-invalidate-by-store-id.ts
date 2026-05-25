/**
 * Invalidate store menus snapshot by store id (async slug lookup).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateStoreMenusSnapshotCache } from "@/lib/stores/store-menus-snapshot-cache";
import { invalidateStoresBrowseSnapshotByStoreId } from "@/lib/stores/stores-browse-snapshot-invalidate-by-store-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export function invalidateStoreMenusSnapshotCacheByStoreId(storeId: string): void {
  const sid = storeId.trim();
  if (!sid) return;
  invalidateStoresBrowseSnapshotByStoreId(sid, "menu_product_change");
  void (async () => {
    const sb = tryCreateSupabaseServiceClient();
    if (!sb) return;
    const { data } = await (sb as SupabaseClient<any>)
      .from("stores")
      .select("slug")
      .eq("id", sid)
      .maybeSingle();
    const slug = String(data?.slug ?? "").trim();
    if (slug) invalidateStoreMenusSnapshotCache(slug);
  })().catch(() => {});
}
