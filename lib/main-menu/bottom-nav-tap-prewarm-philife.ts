"use client";

import {
  buildPhilifeNeighborhoodFeedClientUrl,
  NEIGHBORHOOD_FEED_PAGE_SIZE,
  PHILIFE_GLOBAL_FEED_SESSION_KEY,
} from "@/lib/philife/neighborhood-feed-client-url";
import { fetchNeighborhoodFeedShortTtl } from "@/lib/philife/fetch-neighborhood-feed-short-ttl";
import { writePhilifeFeedCache, philifeFeedViewerSig } from "@/lib/community/philife-feed-session-cache";
import {
  fetchPhilifeNeighborhoodTopicOptions,
  warmPhilifeNeighborhoodTopicOptions,
} from "@/lib/philife/fetch-neighborhood-topic-options-client";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { buildFeedChipsFromPhilifeTopicOptionsJson } from "@/lib/philife/philife-feed-chips-from-topic-options";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { UserRegion } from "@/lib/regions/types";
import { readCommunityHubState } from "@/lib/community/community-hub-state";

const PHILIFE_TAB_PREWARM_COOLDOWN_MS = 12_000;
const philifeTabPrewarmAt = new Map<string, number>();

function canRunPhilifeTabPrewarm(key: string): boolean {
  const now = Date.now();
  const last = philifeTabPrewarmAt.get(key) ?? 0;
  if (now - last < PHILIFE_TAB_PREWARM_COOLDOWN_MS) return false;
  philifeTabPrewarmAt.set(key, now);
  return true;
}

function prewarmPhilifeGlobalFeedVariant(
  viewerSig: string,
  category: string,
  sort: "latest" | "popular" | "recommended"
): void {
  const warmKey = `${viewerSig}:global:${category}:${sort}`;
  if (!canRunPhilifeTabPrewarm(warmKey)) return;
  const personalized = viewerSig !== "_anon";
  const url = buildPhilifeNeighborhoodFeedClientUrl({
    globalFeed: true,
    category: category || undefined,
    offset: 0,
    limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
    sort,
  });
  const flightKey = `philife:tab-prewarm:${viewerSig}:global:${category}:${sort}`;
  void runSingleFlight(flightKey, () =>
    fetchNeighborhoodFeedShortTtl(url, {
      credentials: "include",
      ...(personalized ? { cache: "no-store" as RequestCache } : {}),
    })
  )
    .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
    .then(({ ok, json }) => {
      if (!ok || !json || typeof json !== "object") return;
      const parsed = json as {
        ok?: boolean;
        posts?: Array<Record<string, unknown>>;
        hasMore?: boolean;
        nextOffset?: number | null;
        dbPageLength?: number;
      };
      if (!parsed.ok || !Array.isArray(parsed.posts) || parsed.posts.length === 0) return;
      const advance = typeof parsed.dbPageLength === "number" ? parsed.dbPageLength : parsed.posts.length;
      const nextOffset = typeof parsed.nextOffset === "number" ? parsed.nextOffset : advance;
      writePhilifeFeedCache(
        PHILIFE_GLOBAL_FEED_SESSION_KEY,
        category,
        false,
        viewerSig,
        {
          posts: parsed.posts as NeighborhoodFeedPostDTO[],
          hasMore: !!parsed.hasMore,
          nextOffset,
        },
        sort
      );
    })
    .catch(() => {
      /* philife global prewarm 실패는 무시 */
    });
}

/**
 * Community home prewarm — Home + recommended (globalFeed). Region not required.
 * `@param region` retained for call-site compatibility; unused for home authority.
 */
export function prewarmBottomNavPhilifeTab(_region?: UserRegion | null): void {
  void _region;
  const viewerSig = philifeFeedViewerSig();
  warmPhilifeNeighborhoodTopicOptions();
  prewarmPhilifeGlobalFeedVariant(viewerSig, "", "recommended");
  const saved = readCommunityHubState();
  if (saved?.category) {
    prewarmPhilifeGlobalFeedVariant(viewerSig, saved.category, "latest");
  } else if (saved?.nav === "all" && saved.sort === "popular") {
    prewarmPhilifeGlobalFeedVariant(viewerSig, "", "popular");
  }
  void fetchPhilifeNeighborhoodTopicOptions()
    .then((json) => {
      const { chips } = buildFeedChipsFromPhilifeTopicOptionsJson(json);
      const categoryTargets = chips
        .map((chip) => (chip.slug ?? "").trim())
        .filter((slug) => slug.length > 0)
        .slice(0, 2);
      for (const category of categoryTargets) {
        prewarmPhilifeGlobalFeedVariant(viewerSig, category, "latest");
      }
    })
    .catch(() => {
      /* 칩 prewarm 실패는 무시 */
    });
}
