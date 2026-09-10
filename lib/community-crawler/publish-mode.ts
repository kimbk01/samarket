/**
 * STEP4 publish mode SSOT — external fetch ≠ DIBAY post content.
 * Travel Philippines / REVIEW_REQUIRED → REFERENCE_SUMMARY only.
 */

export const COMMUNITY_CRAWL_PUBLISH_MODES = ["REFERENCE_SUMMARY"] as const;
export type CommunityCrawlPublishMode = (typeof COMMUNITY_CRAWL_PUBLISH_MODES)[number];

export function normalizeCommunityCrawlPublishMode(raw: unknown): CommunityCrawlPublishMode {
  const v = String(raw ?? "").trim();
  if (v === "REFERENCE_SUMMARY") return "REFERENCE_SUMMARY";
  return "REFERENCE_SUMMARY";
}

/** Default for new sources and REVIEW_REQUIRED commercial reuse caution. */
export const COMMUNITY_CRAWL_DEFAULT_PUBLISH_MODE: CommunityCrawlPublishMode = "REFERENCE_SUMMARY";
