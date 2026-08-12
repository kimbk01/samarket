/**
 * Community / Philife neighborhood feed persistent cache — SSOT.
 *
 * CONTRACT
 * - SERVER DATA = AUTHORITY; this cache is paint optimization only.
 * - schemaVersion bump invalidates all prior snapshots (no app-data-delete required).
 * - Query identity includes location/session key + category + neighborOnly + viewer + sort.
 * - Mutable Member Identity labels (author_name) must be overwritten by server refresh —
 *   see `patchNeighborhoodFeedRows` / identity fields in row equality.
 *
 * DO NOT
 * - Treat cached author_name as lasting truth after nickname change.
 * - Reintroduce v3 key as read authority.
 * - Clear all localStorage to "fix" identity stale.
 */

export const COMMUNITY_FEED_CACHE_SCHEMA_VERSION = 4 as const;

/** Current persistent key — bump SCHEMA_VERSION and this key together on breaking envelope/identity policy. */
export const COMMUNITY_FEED_CACHE_STORAGE_KEY =
  `philife_neighborhood_feed_v${COMMUNITY_FEED_CACHE_SCHEMA_VERSION}_persistent` as const;

/** Legacy keys — read ignored; cleared on wipe / schema cutover. */
export const COMMUNITY_FEED_CACHE_LEGACY_STORAGE_KEYS = [
  "philife_neighborhood_feed_v3_persistent",
  "philife_neighborhood_feed_v2",
] as const;

export const COMMUNITY_FEED_CACHE_LEGACY_SESSION_KEY = "philife_neighborhood_feed_v2" as const;

/** Fresh window — still may paint stale then SWR; after this prefer network. */
export const COMMUNITY_FEED_CACHE_FRESH_TTL_MS = 1000 * 60 * 30;

/** Absolute max age before prune (not authority). */
export const COMMUNITY_FEED_CACHE_STALE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export const COMMUNITY_FEED_CACHE_MAX_ENTRIES = 60;

export const COMMUNITY_FEED_LAST_VIEWER_SIG_KEY = "philife_feed_last_viewer_sig_v1" as const;

export type CommunityFeedCacheRegistryEntry = {
  domain: "community_feed";
  class: "server_data_cache";
  storageType: "localStorage";
  storageKey: typeof COMMUNITY_FEED_CACHE_STORAGE_KEY;
  schemaVersion: typeof COMMUNITY_FEED_CACHE_SCHEMA_VERSION;
  freshTtlMs: typeof COMMUNITY_FEED_CACHE_FRESH_TTL_MS;
  staleMaxAgeMs: typeof COMMUNITY_FEED_CACHE_STALE_MAX_AGE_MS;
  authority: "server:/api/philife/neighborhood-feed";
  logoutClear: true;
  accountSwitchClear: true;
  identityProjection: "author_name overwritten by server refresh; not snapshot authority";
};

export const COMMUNITY_FEED_CACHE_REGISTRY: CommunityFeedCacheRegistryEntry = {
  domain: "community_feed",
  class: "server_data_cache",
  storageType: "localStorage",
  storageKey: COMMUNITY_FEED_CACHE_STORAGE_KEY,
  schemaVersion: COMMUNITY_FEED_CACHE_SCHEMA_VERSION,
  freshTtlMs: COMMUNITY_FEED_CACHE_FRESH_TTL_MS,
  staleMaxAgeMs: COMMUNITY_FEED_CACHE_STALE_MAX_AGE_MS,
  authority: "server:/api/philife/neighborhood-feed",
  logoutClear: true,
  accountSwitchClear: true,
  identityProjection: "author_name overwritten by server refresh; not snapshot authority",
};
