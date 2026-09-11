/**
 * Community crawl publish mode contracts.
 *
 * V2-0 FREEZE (do not invent a second operational writer here):
 * - V2 operational TARGET = FULL_CONTENT (implemented in V2-1)
 * - CURRENT runtime path still uses REFERENCE_SUMMARY legacy writer until V2-1
 * - DB CHECK still allows REFERENCE_SUMMARY only — schema expand is V2-1
 */

/** Intended V2 Admin→DIBAY publish contract (not yet the live writer). */
export const COMMUNITY_CRAWL_V2_PUBLISH_TARGET = "FULL_CONTENT" as const;
export type CommunityCrawlV2PublishTarget = typeof COMMUNITY_CRAWL_V2_PUBLISH_TARGET;

/** Legacy runtime mode still written/read until V2-1 replaces operational publish. */
export const COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE = "REFERENCE_SUMMARY" as const;

/**
 * Live DB / normalize enum until V2-1 migration.
 * Do not treat this list as “future product modes forever”.
 */
export const COMMUNITY_CRAWL_PUBLISH_MODES = [COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE] as const;
export type CommunityCrawlPublishMode = (typeof COMMUNITY_CRAWL_PUBLISH_MODES)[number];

export function normalizeCommunityCrawlPublishMode(raw: unknown): CommunityCrawlPublishMode {
  const v = String(raw ?? "").trim();
  if (v === COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE) return COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE;
  // Unknown values collapse to legacy until V2-1 FULL_CONTENT is a live DB value.
  return COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE;
}

/** Default persisted on new sources until V2-1 switches operational default. */
export const COMMUNITY_CRAWL_DEFAULT_PUBLISH_MODE: CommunityCrawlPublishMode =
  COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE;
