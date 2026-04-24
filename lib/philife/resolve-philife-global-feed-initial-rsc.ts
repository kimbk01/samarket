/**
 * Philife `/philife` RSC — 클라 `GET /api/.../neighborhood-feed?globalFeed=1` 첫 청크와
 * `listQueryKey`·`listNeighborhoodFeed` 를 공유해( runSingleFlight ) 이중 히트를 줄인다.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  isPhilifeFeedCategorySlugAllowedByTopics,
  loadPhilifeDefaultSectionTopics,
} from "@/lib/neighborhood/philife-neighborhood-topics";
import { listNeighborhoodFeed } from "@/lib/neighborhood/queries";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { normalizeFeedSort } from "@/lib/community-feed/constants";
import { NEIGHBORHOOD_FEED_PAGE_SIZE } from "@/lib/philife/neighborhood-feed-client-url";

export type PhilifeGlobalFeedInitialRsc = {
  /** `philifeFeedViewerSig` 와 일치할 때만 클라이언트가 시드 적용(로그인/비로그인) */
  viewerKey: string;
  /** 시드 생성에 사용한 주제·정렬(클라가 현재 URL과 일치할 때만 재사용) */
  seededCategory: string;
  seededSort: "latest" | "popular" | "recommended";
  posts: NeighborhoodFeedPostDTO[];
  hasMore: boolean;
  nextOffset: number | null;
  pagingOffsetAdvance: number;
};

/**
 * `globalFeed=1`, offset 0, 관심이웃 off — URL `category`·`sort` 가 있으면 동일 조건으로 시드(없으면 전체·최신).
 */
export async function resolvePhilifeGlobalFeedInitialForRsc(
  viewerUserId: string | null,
  input?: { category?: string; sort?: string }
): Promise<PhilifeGlobalFeedInitialRsc> {
  const topics = await loadPhilifeDefaultSectionTopics();
  const category = input?.category?.trim().toLowerCase() ?? "";
  if (category && !isPhilifeFeedCategorySlugAllowedByTopics(topics, category)) {
    throw new Error("invalid_category");
  }
  const sortRaw = input?.sort?.trim() ?? "";
  const feedSort: "latest" | "popular" | "recommended" = (() => {
    if (!category) {
      if (!sortRaw) return "latest";
      return normalizeFeedSort(sortRaw);
    }
    if ((category === "recommend" || category === "recommended") && !sortRaw) return "recommended";
    return normalizeFeedSort(sortRaw || undefined);
  })();
  const vId = (viewerUserId && viewerUserId.trim()) || null;
  /** `app/api/.../neighborhood-feed` 의 `listQueryKey`·클라 `philifeFeedViewerSig` 는 null→anon / _anon이 다르므로 분리 */
  const listKeyViewerSegment = vId ?? "anon";
  const viewerKey = vId || "_anon";
  const offset = 0;
  const limit = NEIGHBORHOOD_FEED_PAGE_SIZE;
  const listQueryKey = [
    "community:neighborhood-feed:list",
    listKeyViewerSegment,
    "global",
    "all",
    category || "all",
    "all",
    "all-users",
    String(offset),
    String(limit),
    String(feedSort),
  ].join(":");

  const listResult = await runSingleFlight(listQueryKey, async () =>
    listNeighborhoodFeed({
      allLocations: true,
      ...(category ? { category } : {}),
      offset,
      limit,
      viewerUserId: vId,
      neighborOnly: false,
      feedSort,
      topics,
    })
  );
  const { posts, hasMore, pagingOffsetAdvance } = listResult;
  return {
    viewerKey,
    seededCategory: category,
    seededSort: feedSort,
    posts,
    hasMore,
    nextOffset: hasMore ? offset + pagingOffsetAdvance : null,
    pagingOffsetAdvance,
  };
}
