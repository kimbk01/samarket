import { normalizeFeedSlug, normalizeSectionSlug } from "@/lib/community-feed/constants";

/**
 * Sort-tab seed slugs — never general compose topics.
 * Defense when `is_feed_sort` is wrong in DB.
 */
export function isPhilifeNeighborhoodSortSlotSlug(raw: string): boolean {
  const s = normalizeFeedSlug(raw);
  return s === "popular" || s === "recommend" || s === "recommended";
}

/**
 * Canonical general write eligibility (Composer + `resolveTopicForNeighborhoodCategory`).
 *
 * SSOT for normal content Topics: `community_topics` (caller already requires
 * is_active + is_visible). This helper only excludes sort-slot seed slugs.
 *
 * DO NOT add a content-topic allowlist here.
 */
export function isPhilifeNeighborhoodWriteEligibleRow(_isFeedSort: boolean, slug: string): boolean {
  if (isPhilifeNeighborhoodSortSlotSlug(slug)) return false;
  return true;
}

/** 동네 피드에 연결된 섹션(`admin_settings` 또는 기본 dongnae)과 주제의 섹션이 같은지 */
export function topicBelongsToPhilifeNeighborhoodSection(
  sectionSlug: string | null | undefined,
  philifeNeighborhoodSectionSlug: string
): boolean {
  const p = normalizeSectionSlug(philifeNeighborhoodSectionSlug);
  if (!p) return false;
  return normalizeSectionSlug(sectionSlug) === p;
}
