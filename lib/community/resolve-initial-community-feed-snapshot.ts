/**
 * Cold + Warm 단일 community feed snapshot resolver.
 *
 * CONTRACT: tab enter · cold hydrate · resume 가 같은 함수로 persistent snapshot 을 읽는다.
 * DO NOT: Cold 만 useLayoutEffect 복원 · Warm 만 tabEnterInstantBoot 분기 유지.
 * Server 에서는 항상 null (localStorage 없음) — client 첫 mount / layoutEffect 가 동일 payload 사용.
 */
import { normalizeFeedSort } from "@/lib/community-feed/constants";
import {
  philifeFeedViewerSig,
  readPhilifeFeedCache,
  resolvePhilifeColdBootViewerSig,
} from "@/lib/community/philife-feed-session-cache";
import { peekPhilifeNeighborhoodTopicOptionsFromCache } from "@/lib/philife/fetch-neighborhood-topic-options-client";
import { isPhilifeRecommendSortCategory } from "@/lib/philife/philife-feed-chips-from-topic-options";
import { PHILIFE_GLOBAL_FEED_SESSION_KEY } from "@/lib/philife/neighborhood-feed-client-url";
import type { PhilifeGlobalFeedInitialRsc } from "@/lib/philife/resolve-philife-global-feed-initial-rsc";

export function parseCommunityFeedHref(href: string): { category: string; sort: string; path: string } {
  try {
    const u = new URL(href, "https://samarket.local");
    return {
      path: u.pathname.replace(/\/+$/, "") || "/",
      category: (u.searchParams.get("category") ?? "").trim().toLowerCase(),
      sort: (u.searchParams.get("sort") ?? "").trim(),
    };
  } catch {
    return { path: "/", category: "", sort: "" };
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

/**
 * Persistent snapshot → RSC-shaped seed (cache · network 동일 CommunityFeed 경로).
 * `href` 생략 시 `window.location` (cold `/` · `/philife`).
 */
export function resolveInitialCommunityFeedSnapshot(args?: {
  href?: string;
}): PhilifeGlobalFeedInitialRsc | null {
  if (typeof window === "undefined") return null;

  const href =
    args?.href?.trim() ||
    `${window.location.pathname}${window.location.search}` ||
    "/";
  const { category, sort } = parseCommunityFeedHref(href);
  const seededSort = resolvePhilifeFeedSortForQuery(category, sort);
  const isAllTabView = !category || isPhilifeRecommendSortCategory(category);
  const recSortKey: "latest" | "recommended" = (() => {
    if (!isAllTabView) return "latest";
    if (!sort.trim()) return "latest";
    return normalizeFeedSort(sort) === "recommended" ? "recommended" : "latest";
  })();

  const liveSig = philifeFeedViewerSig();
  const cacheViewerSig = liveSig !== "_anon" ? liveSig : resolvePhilifeColdBootViewerSig();
  const snap = readPhilifeFeedCache(
    PHILIFE_GLOBAL_FEED_SESSION_KEY,
    category,
    false,
    cacheViewerSig,
    recSortKey
  );
  if (!snap?.posts?.length) return null;

  const topicOptionsSeed = peekPhilifeNeighborhoodTopicOptionsFromCache() ?? undefined;

  return {
    viewerKey: cacheViewerSig,
    seededCategory: category,
    seededSort,
    posts: snap.posts,
    hasMore: snap.hasMore,
    nextOffset: snap.nextOffset,
    pagingOffsetAdvance: snap.posts.length,
    ...(topicOptionsSeed ? { topicOptionsSeed } : {}),
  };
}
