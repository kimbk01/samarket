import "server-only";

import { invalidateStoreSummaryPublicServerCache } from "@/lib/stores/store-summary-public-server-cache";
import { invalidateStoreMenusSnapshotCache } from "@/lib/stores/store-menus-snapshot-cache";
import { invalidateStoresBrowseSnapshot } from "@/lib/stores/stores-browse-snapshot-cache";
import { invalidateStorePublicCachesForSlug } from "@/lib/stores/store-public-cache-invalidate";
import { invalidateApprovedStoreSlugCacheForSlug } from "@/lib/stores/get-approved-store-by-slug";

/** API route — 서버 memory·snapshot refresh + 클라/이벤트 purge (동일 slug). */
export function invalidateStorePublicCachesForSlugOnServer(slug: string): void {
  const s = slug.trim();
  if (!s) return;
  const k = s.toLowerCase();
  invalidateApprovedStoreSlugCacheForSlug(k);
  invalidateStoreSummaryPublicServerCache(k);
  invalidateStoreMenusSnapshotCache(s);
  invalidateStoresBrowseSnapshot(undefined, "store_public_slug");
  invalidateStorePublicCachesForSlug(s);
}
