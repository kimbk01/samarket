/**
 * STEP2 contract only — Admin Community post detail importer provenance.
 * Edit writer + UI wiring is deferred; crawlers must respect this when implemented.
 */

export const COMMUNITY_CRAWL_IMPORTED_ADMIN_DETAIL_FIELDS = [
  "origin_kind",
  "source_name",
  "board_name",
  "canonical_url",
  "last_synced_at",
] as const;

/**
 * Any Admin edit of an imported community_post content/metadata
 * MUST set the linked post_link.manual_override = true before content write.
 * Crawler SYNC_UPDATE must refuse overwrite when manual_override is true.
 */
export const COMMUNITY_CRAWL_MANUAL_OVERRIDE_ON_ADMIN_EDIT = true as const;

/** User Feed/Detail: no “crawled/external” badge by default. */
export const COMMUNITY_CRAWL_USER_SOURCE_BADGE_DEFAULT = "NO" as const;
