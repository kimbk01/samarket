/**
 * SB1 stores browse snapshot invalidation by store id.
 */
import { invalidateStoresBrowseSnapshot } from "@/lib/stores/stores-browse-snapshot-cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export function invalidateStoresBrowseSnapshotByStoreId(storeId: string, reason?: string): void {
  const sid = storeId.trim();
  if (!sid) return;
  void (async () => {
    const sb = tryGetSupabaseForStores();
    if (!sb) {
      invalidateStoresBrowseSnapshot(undefined, reason ?? "store_event");
      return;
    }
    const { data } = await sb
      .from("stores")
      .select("store_categories ( slug )")
      .eq("id", sid)
      .maybeSingle();
    const embed = (data as { store_categories?: { slug?: string } | { slug?: string }[] | null } | null)
      ?.store_categories;
    const cat =
      Array.isArray(embed) ? embed[0]
      : embed;
    const primary = String(cat?.slug ?? "").trim().toLowerCase();
    invalidateStoresBrowseSnapshot(primary || undefined, reason ?? "store_event");
  })();
}
