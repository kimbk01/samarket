/**
 * Community crawl publish mode contracts (V2-1).
 *
 * OPERATIONAL: FULL_CONTENT (Admin items/[id]/publish)
 * LEGACY ONLY: REFERENCE_SUMMARY (retired import route / historical RPC)
 */

export const COMMUNITY_CRAWL_V2_PUBLISH_TARGET = "FULL_CONTENT" as const;
export type CommunityCrawlV2PublishTarget = typeof COMMUNITY_CRAWL_V2_PUBLISH_TARGET;

export const COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE = "REFERENCE_SUMMARY" as const;

/** Live DB CHECK values after V2-1 migration. */
export const COMMUNITY_CRAWL_PUBLISH_MODES = [
  COMMUNITY_CRAWL_V2_PUBLISH_TARGET,
  COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE,
] as const;
export type CommunityCrawlPublishMode = (typeof COMMUNITY_CRAWL_PUBLISH_MODES)[number];

export function normalizeCommunityCrawlPublishMode(raw: unknown): CommunityCrawlPublishMode {
  const v = String(raw ?? "").trim();
  if (v === COMMUNITY_CRAWL_V2_PUBLISH_TARGET) return COMMUNITY_CRAWL_V2_PUBLISH_TARGET;
  if (v === COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE) return COMMUNITY_CRAWL_LEGACY_PUBLISH_MODE;
  // Unknown → operational default
  return COMMUNITY_CRAWL_V2_PUBLISH_TARGET;
}

/** Default for new sources — operational FULL_CONTENT. */
export const COMMUNITY_CRAWL_DEFAULT_PUBLISH_MODE: CommunityCrawlPublishMode =
  COMMUNITY_CRAWL_V2_PUBLISH_TARGET;
