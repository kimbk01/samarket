"use client";

import { useMemo } from "react";

import { Feed as PhilifeFeedClient } from "@/components/community/Feed";
import { normalizeFeedSort } from "@/lib/community-feed/constants";
import {
  philifeFeedViewerSig,
  readPhilifeFeedCache,
} from "@/lib/community/philife-feed-session-cache";
import { peekPhilifeNeighborhoodTopicOptionsFromCache } from "@/lib/philife/fetch-neighborhood-topic-options-client";
import { isPhilifeRecommendSortCategory } from "@/lib/philife/philife-feed-chips-from-topic-options";
import { PHILIFE_GLOBAL_FEED_SESSION_KEY } from "@/lib/philife/neighborhood-feed-client-url";
import type { PhilifeGlobalFeedInitialRsc } from "@/lib/philife/resolve-philife-global-feed-initial-rsc";

function parsePhilifeTabEnterHref(href: string): { category: string; sort: string } {
  try {
    const u = new URL(href, "https://samarket.local");
    return {
      category: (u.searchParams.get("category") ?? "").trim().toLowerCase(),
      sort: (u.searchParams.get("sort") ?? "").trim(),
    };
  } catch {
    return { category: "", sort: "" };
  }
}

function resolvePhilifeFeedSortForQuery(
  categoryRaw: string,
  sortRaw: string
): "latest" | "popular" | "recommended" {
  const c = categoryRaw.trim().toLowerCase();
  if (!c) {
    if (!sortRaw.trim()) return "latest";
    return normalizeFeedSort(sortRaw);
  }
  if (isPhilifeRecommendSortCategory(c) && !sortRaw.trim()) return "recommended";
  return normalizeFeedSort(sortRaw || undefined);
}

/** 하단 탭 push pending panel — session cache를 RSC seed 형태로 동기 합성 */
function resolvePhilifeTabEnterBootFromSessionCache(
  href: string
): PhilifeGlobalFeedInitialRsc | null {
  if (typeof window === "undefined") return null;

  const { category, sort } = parsePhilifeTabEnterHref(href);
  const seededSort = resolvePhilifeFeedSortForQuery(category, sort);
  const isAllTabView = !category || isPhilifeRecommendSortCategory(category);
  const recSortKey: "latest" | "recommended" = (() => {
    if (!isAllTabView) return "latest";
    if (!sort.trim()) return "latest";
    return normalizeFeedSort(sort) === "recommended" ? "recommended" : "latest";
  })();

  const viewerSig = philifeFeedViewerSig();
  const snap = readPhilifeFeedCache(
    PHILIFE_GLOBAL_FEED_SESSION_KEY,
    category,
    false,
    viewerSig,
    recSortKey
  );
  if (!snap?.posts?.length) return null;

  const topicOptionsSeed = peekPhilifeNeighborhoodTopicOptionsFromCache() ?? undefined;

  return {
    viewerKey: viewerSig,
    seededCategory: category,
    seededSort,
    posts: snap.posts,
    hasMore: snap.hasMore,
    nextOffset: snap.nextOffset,
    pagingOffsetAdvance: snap.posts.length,
    ...(topicOptionsSeed ? { topicOptionsSeed } : {}),
  };
}

export function PhilifeFeedClientEntry({
  initialGlobalFeed = null,
  tabEnterInstantBoot = false,
  tabEnterHref = "/philife",
}: {
  initialGlobalFeed?: PhilifeGlobalFeedInitialRsc | null;
  /** 하단 탭 push pending panel — session cache instant boot (RSC seed 경로 재사용) */
  tabEnterInstantBoot?: boolean;
  tabEnterHref?: string;
}) {
  const resolvedInitialGlobalFeed = useMemo(() => {
    if (initialGlobalFeed) return initialGlobalFeed;
    if (!tabEnterInstantBoot) return null;
    return resolvePhilifeTabEnterBootFromSessionCache(tabEnterHref);
  }, [initialGlobalFeed, tabEnterInstantBoot, tabEnterHref]);

  return <PhilifeFeedClient initialGlobalFeedRsc={resolvedInitialGlobalFeed} />;
}
