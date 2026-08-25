import type { StoresBrowseDiscoveryShelfPayload } from "@/lib/stores/stores-browse-discovery-shelf";
import { parseStoresBrowseDiscoveryShelfPayload } from "@/lib/stores/stores-browse-discovery-shelf";

/**
 * Live GET must not reuse TTL/min-gap JSON as shelf-policy authority.
 * Row paint still uses peekStoresBrowseClientCache.
 */
export function shouldReuseStoresBrowseLiveGet(): boolean {
  return false;
}

/** Paint/session may keep organic rows; discoveryShelf is network-only. */
export function browsePaintRowsOnly<T extends { discoveryShelf?: StoresBrowseDiscoveryShelfPayload | null }>(
  snapshot: T
): Omit<T, "discoveryShelf"> & { discoveryShelf?: undefined } {
  const { discoveryShelf: _ignored, ...rest } = snapshot;
  return rest;
}

/** Fresh customer response always replaces paint/session shelf, including null. */
export function networkDiscoveryShelfWins(
  _paintShelf: StoresBrowseDiscoveryShelfPayload | null | undefined,
  networkRaw: unknown
): StoresBrowseDiscoveryShelfPayload | null {
  return parseStoresBrowseDiscoveryShelfPayload(networkRaw);
}
