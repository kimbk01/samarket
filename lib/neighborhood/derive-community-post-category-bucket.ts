/**
 * `community_posts.category` is NOT topic identity.
 *
 * CONTRACT:
 * - Topic identity = `topic_id` / `topic_slug`
 * - `category` = constrained enum column (CHECK) used as:
 *   - meetup SPECIAL_BEHAVIOR bucket when isMeetup
 *   - legacy enum slug when raw topic matches enum
 *   - SCHEMA_FILLER `etc` for Admin custom topics
 *
 * DO NOT use this return value as the product Topic label/filter authority.
 */

import {
  normalizeNeighborhoodCategory,
  type NeighborhoodCategorySlug,
} from "@/lib/neighborhood/categories";

export function deriveCommunityPostCategoryBucket(input: {
  /** Composer/topic slug or legacy category raw — not authoritative identity */
  topicOrCategoryRaw: string;
  isMeetup: boolean;
}): NeighborhoodCategorySlug {
  if (input.isMeetup) return "meetup";
  return normalizeNeighborhoodCategory(input.topicOrCategoryRaw) ?? "etc";
}
