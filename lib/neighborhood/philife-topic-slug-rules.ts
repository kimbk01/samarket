import { normalizeFeedSlug } from "@/lib/community-feed/constants";

/**
 * Meetup misconfig guard — NOT content write allowlist.
 *
 * If Admin marks a known content slug `allow_meetup=true` by mistake, that slug
 * must not appear as a meetup-writer topic. Normal compose eligibility does **not**
 * consult this set (community_topics.is_active/is_visible/allow_meetup + sort-slot).
 *
 * KEEP for meetup SPECIAL_BEHAVIOR only. Do not revive as content Topic authority.
 */
const EXTRA_GENERAL_SLUGS = ["free", "board", "general", "talk"] as const;

const BASE_FROM_NEIGHBORHOOD = [
  "question",
  "info",
  "daily",
  "job",
  "food",
  "promo",
  "notice",
  "etc",
] as const;

export const PHILIFE_GENERAL_ONLY_TOPIC_SLUGS: ReadonlySet<string> = new Set<string>([
  ...BASE_FROM_NEIGHBORHOOD,
  ...EXTRA_GENERAL_SLUGS,
]);

export function isPhilifeGeneralOnlyTopicSlug(raw: string): boolean {
  const s = normalizeFeedSlug(raw);
  if (!s) return false;
  return PHILIFE_GENERAL_ONLY_TOPIC_SLUGS.has(s);
}

/**
 * Sort-tab seed slugs — never general compose topics.
 * Defense when `is_feed_sort` is wrong in DB.
 */
export function isPhilifeNeighborhoodSortSlotSlug(raw: string): boolean {
  const s = normalizeFeedSlug(raw);
  return s === "popular" || s === "recommend" || s === "recommended";
}

/** Meetup writer topics: DB `allow_meetup` + not a content-slug misconfig. */
export function qualifiesForPhilifeMeetupWriterTopic(allowMeetup: boolean, slug: string): boolean {
  return allowMeetup && !isPhilifeGeneralOnlyTopicSlug(slug);
}

/**
 * Canonical general write eligibility (Composer + `resolveTopicForNeighborhoodCategory`).
 *
 * SSOT for normal content Topics: `community_topics` (caller already requires
 * is_active + is_visible). This helper only excludes system/special rows:
 * - sort-slot seed slugs
 * - meetup-dedicated rows (`allow_meetup`)
 *
 * DO NOT use PHILIFE_GENERAL_ONLY_TOPIC_SLUGS here — that would reintroduce a
 * competing content-topic allowlist.
 */
export function isPhilifeNeighborhoodWriteEligibleRow(
  allowMeetup: boolean,
  _isFeedSort: boolean,
  slug: string
): boolean {
  if (isPhilifeNeighborhoodSortSlotSlug(slug)) return false;
  if (allowMeetup) return false;
  return true;
}
