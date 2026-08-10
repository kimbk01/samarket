/**
 * Community feed SURFACE SSOT — posts / chips / URL / Feed Banner share one result.
 *
 * CONTRACT (aligned to Community Nav SSOT + sold Feed Banner products):
 * - HOME nav → COMMUNITY_HOME (sold product)
 * - TOPIC nav + topic_slug → COMMUNITY_TOPIC (sold product; community_topics slug authority)
 * - LOCAL nav → no Feed Banner (no sold Local placement; do not borrow HOME)
 * - POPULAR nav → no Feed Banner (no sold Popular placement; do not borrow HOME)
 * - DO NOT fallback HOME campaign into TOPIC (or reverse)
 * - DO NOT invent COMMUNITY_LOCAL / COMMUNITY_POPULAR placement enums/tables
 */

import type { CommunityNavKind } from "@/lib/community/community-nav";
import { isPhilifeRecommendSortCategory } from "@/lib/philife/philife-feed-chips-from-topic-options";
import {
  normalizeFeedAdTopicSlug,
  type FeedAdPlacement,
} from "@/lib/ads/feed-ad-placement";

export type CommunityFeedAdSurface = {
  /** null = Feed Banner disabled on this nav surface */
  placement: Extract<FeedAdPlacement, "COMMUNITY_HOME" | "COMMUNITY_TOPIC"> | null;
  topicSlug: string | undefined;
  /** Stable key for feedSessionId / cadence / selector seed. */
  surfaceKey: string;
  /** Same key posts cache / chip / URL should use ("" = all/home). */
  feedCategoryKey: string;
};

/**
 * @param feedCategoryKey — authoritative topic slug when nav=topic (synced chip/URL/state)
 * @param navKind — Community Nav selection kind (Home|Topic|Local|Popular)
 */
export function resolveCommunityFeedSurface(
  feedCategoryKey: string,
  navKind: CommunityNavKind = "home"
): CommunityFeedAdSurface {
  if (navKind === "local") {
    return {
      placement: null,
      topicSlug: undefined,
      surfaceKey: "community:local",
      feedCategoryKey: "",
    };
  }
  if (navKind === "popular") {
    return {
      placement: null,
      topicSlug: undefined,
      surfaceKey: "community:popular",
      feedCategoryKey: "",
    };
  }
  if (navKind === "topic") {
    const c = String(feedCategoryKey ?? "").trim().toLowerCase();
    if (!c || isPhilifeRecommendSortCategory(c)) {
      return {
        placement: null,
        topicSlug: undefined,
        surfaceKey: "community:topic:unset",
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

  return {
    placement: "COMMUNITY_HOME",
    topicSlug: undefined,
    surfaceKey: "community:home",
    feedCategoryKey: "",
  };
}
