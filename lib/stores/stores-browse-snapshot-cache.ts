/**
 * SB1 stores browse snapshot invalidation + response memory purge.
 */
import { forgetSingleFlight } from "@/lib/http/run-single-flight";
import { invalidateStoresBrowseMemoryCache } from "@/lib/stores/stores-browse-response-cache";
import { scheduleStoresBrowseSnapshotRefresh } from "@/lib/stores/stores-browse-snapshot-refresh";

const SNAPSHOT_SINGLE_FLIGHT_PREFIX = "sb1-stores-browse-snapshot:";

export function invalidateStoresBrowseSnapshot(primarySlug?: string, reason?: string): void {
  invalidateStoresBrowseMemoryCache(primarySlug);
  const primary = primarySlug?.trim().toLowerCase();
  if (primary) {
    forgetSingleFlight(`${SNAPSHOT_SINGLE_FLIGHT_PREFIX}${primary}:all`);
    scheduleStoresBrowseSnapshotRefresh(primary);
  }
  if (process.env.NODE_ENV === "development" && reason) {
    // eslint-disable-next-line no-console -- invalidation probe
    console.log("[stores-browse-snapshot-invalidate]", { primary_slug: primary ?? "*", reason });
  }
}
