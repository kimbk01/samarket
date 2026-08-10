/**
 * Community feed SURFACE SSOT — posts / chips / URL / Feed Banner share one result.
 *
 * CONTRACT (2026-08-10 product reopen):
 * - HOME: empty or recommend-sort feed category → COMMUNITY_HOME
 * - TOPIC: real topic slug → COMMUNITY_TOPIC + normalized slug
 * - DO NOT derive banner placement from URL alone while posts use category state
 * - DO NOT fallback HOME campaign into TOPIC (or reverse)
 */

import { isPhilifeRecommendSortCategory } from "@/lib/philife/philife-feed-chips-from-topic-options";
import {
  normalizeFeedAdTopicSlug,
  type FeedAdPlacement,
} from "@/lib/ads/feed-ad-placement";

export type CommunityFeedAdSurface = {
  placement: Extract<FeedAdPlacement, "COMMUNITY_HOME" | "COMMUNITY_TOPIC">;
  topicSlug: string | undefined;
  /** Stable key for feedSessionId / cadence / selector seed. */
  surfaceKey: string;
  /** Same key posts cache / chip / URL should use ("" = all/home). */
  feedCategoryKey: string;
};

/**
 * @param feedCategoryKey — authoritative feed category (synced chip/URL/state), not a divergent boot-only guess
 */
export function resolveCommunityFeedSurface(feedCategoryKey: string): CommunityFeedAdSurface {
  const c = String(feedCategoryKey ?? "").trim().toLowerCase();
  if (!c || isPhilifeRecommendSortCategory(c)) {
    return {
      placement: "COMMUNITY_HOME",
      topicSlug: undefined,
      surfaceKey: "community:home",
      feedCategoryKey: "",
    };
  }
  const slug = normalizeFeedAdTopicSlug(c);
  return {
    placement: "COMMUNITY_TOPIC",
    topicSlug: slug,
    surfaceKey: `community:topic:${slug}`,
    feedCategoryKey: slug,
  };
}
