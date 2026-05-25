/**
 * Store menus snapshot invalidation — domain events → counter refresh.
 */
import { invalidateStoreMenusPublicServerCacheForSlug } from "@/lib/stores/store-menus-public-server-cache";
import { scheduleStoreMenusSnapshotRefreshForSlug } from "@/lib/stores/store-menus-snapshot-refresh";

/** Invalidate route memory + schedule snapshot refresh for store slug. */
export function invalidateStoreMenusSnapshotCache(slug: string): void {
  const s = slug.trim();
  if (!s) return;
  invalidateStoreMenusPublicServerCacheForSlug(s);
  scheduleStoreMenusSnapshotRefreshForSlug(s);
}
