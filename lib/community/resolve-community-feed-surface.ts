/**
 * Community feed SURFACE SSOT — posts / chips / URL / Feed Banner share one result.
 *
 * CONTRACT (2026-08-10 community SSOT connect):
 * - ALL (Latest|Popular global list) → COMMUNITY_HOME (sold + all-topic candidate pool)
 * - TOPIC nav + topic_slug → COMMUNITY_TOPIC (matching topic only)
 * - LOCAL nav → no Feed Banner (no sold Local placement)
 * - Legacy POPULAR kind → absorb as ALL surface (same as all+popular URL)
 * - DO NOT invent COMMUNITY_LOCAL / COMMUNITY_POPULAR placement enums/tables
 * - Candidate pool rules live in listEligibleCampaignsForPlacement (not here)
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
 * @param navKind — Community Nav selection kind (default all = Latest|Popular list)
 */
export function resolveCommunityFeedSurface(
  feedCategoryKey: string,
  navKind: CommunityNavKind = "all"
): CommunityFeedAdSurface {
  if (navKind === "local") {
    return {
      placement: null,
      topicSlug: undefined,
      surfaceKey: "community:local",
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

  /**
   * ALL latest|popular (+ legacy home/popular kinds):
   * COMMUNITY_HOME surface — candidate pool = HOME + all TOPIC (resolver).
   * Sort (latest vs popular) does not change placement / pool.
   */
  if (
    navKind === "all" ||
    navKind === "home" ||
    navKind === "popular"
  ) {
    return {
      placement: "COMMUNITY_HOME",
      topicSlug: undefined,
      surfaceKey: "community:all",
      feedCategoryKey: "",
    };
  }

  return {
    placement: "COMMUNITY_HOME",
    topicSlug: undefined,
    surfaceKey: "community:all",
    feedCategoryKey: "",
  };
}
