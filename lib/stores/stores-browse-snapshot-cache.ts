/**
 * SB1 stores browse snapshot invalidation + response memory purge.
 */
import { forgetSingleFlightsWhere } from "@/lib/http/run-single-flight";
import { invalidateStoresBrowseMemoryCache } from "@/lib/stores/stores-browse-response-cache";
import { scheduleStoresBrowseSnapshotRefresh } from "@/lib/stores/stores-browse-snapshot-refresh";
import { STORES_BROWSE_SNAPSHOT_SINGLE_FLIGHT_PREFIX } from "@/lib/stores/stores-browse-snapshot-counter";

/**
 * 5-C BR-01 — 해당 1차의 **모든 2차** 스냅샷 단일 비행을 해제한다
 * (키 = `sb1-stores-browse-snapshot:{primary}:{sub}:{counter|rpc}`). 이전에는 존재하지 않는 `{primary}:all` 키만 지웠다.
 */
export function forgetStoresBrowseSnapshotSingleFlights(primarySlug: string): void {
  const primary = primarySlug.trim().toLowerCase();
  if (!primary) return;
  const prefix = `${STORES_BROWSE_SNAPSHOT_SINGLE_FLIGHT_PREFIX}${primary}:`;
  forgetSingleFlightsWhere((key) => key.startsWith(prefix));
}

export function invalidateStoresBrowseSnapshot(primarySlug?: string, reason?: string): void {
  invalidateStoresBrowseMemoryCache(primarySlug);
  const primary = primarySlug?.trim().toLowerCase();
  if (primary) {
    forgetStoresBrowseSnapshotSingleFlights(primary);
    scheduleStoresBrowseSnapshotRefresh(primary, "all");
  }
  if (process.env.NODE_ENV === "development" && reason) {
    // eslint-disable-next-line no-console -- invalidation probe
    console.log("[stores-browse-snapshot-invalidate]", { primary_slug: primary ?? "*", reason });
  }
}
