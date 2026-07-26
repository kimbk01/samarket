/**
 * Cold + Warm 단일 community feed snapshot resolver.
 *
 * CONTRACT: cold hydrate · resume 가 같은 함수로 persistent snapshot 을 읽는다.
 * DO NOT: 렌더 중 localStorage 를 읽어 서버 HTML 과 hydration 첫 렌더를 다르게 만들지 않는다.
 * Server 에서는 항상 null (localStorage 없음) — client layoutEffect 에서만 복원한다.
 */
import { normalizeFeedSort } from "@/lib/community-feed/constants";
import {
  philifeFeedViewerSig,
  readPhilifeFeedCache,
  resolvePhilifeColdBootViewerSig,
} from "@/lib/community/philife-feed-session-cache";
import { peekPhilifeNeighborhoodTopicOptionsFromCache } from "@/lib/philife/fetch-neighborhood-topic-options-client";
import {
  buildFeedChipsFromPhilifeTopicOptionsJson,
  isPhilifeRecommendSortCategory,
} from "@/lib/philife/philife-feed-chips-from-topic-options";
import { PHILIFE_GLOBAL_FEED_SESSION_KEY } from "@/lib/philife/neighborhood-feed-client-url";
import type { PhilifeNeighborhoodTopicOptionsJson } from "@/lib/philife/neighborhood-topic-options-contract";
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

export type CommunityFeedBootSelection = {
  category: string;
  authorityReady: boolean;
};

/**
 * URL category 가 있으면 그것이 권한이다.
 * category 가 없으면 topic-options 의 `showAllFeedTab`/첫 칩이 기본 피드 권한이다.
 * options 자체가 없으면 전체 피드를 추측하지 않는다.
 */
export function resolveCommunityFeedBootSelection(
  categoryRaw: string,
  topicOptions: PhilifeNeighborhoodTopicOptionsJson | null | undefined
): CommunityFeedBootSelection {
  const explicitCategory = categoryRaw.trim().toLowerCase();
  if (explicitCategory) {
    return { category: explicitCategory, authorityReady: true };
  }
  if (!topicOptions) {
    return { category: "", authorityReady: false };
  }
  if (topicOptions.showAllFeedTab !== false) {
    return { category: "", authorityReady: true };
  }

  const firstCategory = buildFeedChipsFromPhilifeTopicOptionsJson(topicOptions)
    .chips[0]?.slug?.trim()
    .toLowerCase();
  return {
    category: firstCategory ?? "",
    authorityReady: Boolean(firstCategory),
  };
}

/**
 * topic-options 객체가 새로 와도 feed authority 가 같으면 state 교체·feed reset 금지.
 * DO NOT: 참조 비교만으로 setTopicOptionsAuthority — 동일 칩/탭이면 neighborhood-feed 재요청됨.
 */
export function isSameCommunityTopicOptionsAuthority(
  a: PhilifeNeighborhoodTopicOptionsJson | null | undefined,
  b: PhilifeNeighborhoodTopicOptionsJson | null | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if ((a.showAllFeedTab !== false) !== (b.showAllFeedTab !== false)) return false;
  if ((a.showNeighborOnlyFilter !== false) !== (b.showNeighborOnlyFilter !== false)) return false;
  const aChips = buildFeedChipsFromPhilifeTopicOptionsJson(a).chips;
  const bChips = buildFeedChipsFromPhilifeTopicOptionsJson(b).chips;
  if (aChips.length !== bChips.length) return false;
  for (let i = 0; i < aChips.length; i += 1) {
    if ((aChips[i]?.slug ?? "").trim().toLowerCase() !== (bChips[i]?.slug ?? "").trim().toLowerCase()) {
      return false;
    }
  }
  return true;
}

/**
 * Persistent snapshot → RSC-shaped seed (cache · network 동일 CommunityFeed 경로).
 * `href` 생략 시 `window.location` (cold `/` · `/philife`).
 */
export function resolveInitialCommunityFeedSnapshot(args?: {
  href?: string;
  topicOptions?: PhilifeNeighborhoodTopicOptionsJson | null;
}): PhilifeGlobalFeedInitialRsc | null {
  if (typeof window === "undefined") return null;

  const href =
    args?.href?.trim() ||
    `${window.location.pathname}${window.location.search}` ||
    "/";
  const parsed = parseCommunityFeedHref(href);
  const topicOptions =
    args?.topicOptions === undefined
      ? peekPhilifeNeighborhoodTopicOptionsFromCache()
      : args.topicOptions;
  const selection = resolveCommunityFeedBootSelection(parsed.category, topicOptions);
  if (!selection.authorityReady) return null;

  const category = selection.category;
  const { sort } = parsed;
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

  const topicOptionsSeed = topicOptions ?? undefined;

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
