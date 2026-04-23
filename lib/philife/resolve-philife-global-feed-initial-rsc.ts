/**
 * Philife `/philife` RSC — 클라 `GET /api/.../neighborhood-feed?globalFeed=1` 첫 청크와
 * `listQueryKey`·`listNeighborhoodFeed` 를 공유해( runSingleFlight ) 이중 히트를 줄인다.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { loadPhilifeDefaultSectionTopics } from "@/lib/neighborhood/philife-neighborhood-topics";
import { listNeighborhoodFeed } from "@/lib/neighborhood/queries";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { NEIGHBORHOOD_FEED_PAGE_SIZE } from "@/lib/philife/neighborhood-feed-client-url";

export type PhilifeGlobalFeedInitialRsc = {
  /** `philifeFeedViewerSig` 와 일치할 때만 클라이언트가 시드 적용(로그인/비로그인) */
  viewerKey: string;
  posts: NeighborhoodFeedPostDTO[];
  hasMore: boolean;
  nextOffset: number | null;
  pagingOffsetAdvance: number;
};

/**
 * `globalFeed=1`, offset 0, 주제·관심이웃 off, 추천 탭 아님(최신 정렬) — 필라이프 랜딩과 동일.
 */
export async function resolvePhilifeGlobalFeedInitialForRsc(
  viewerUserId: string | null
): Promise<PhilifeGlobalFeedInitialRsc> {
  const topics = await loadPhilifeDefaultSectionTopics();
  const vId = (viewerUserId && viewerUserId.trim()) || null;
  /** `app/api/.../neighborhood-feed` 의 `listQueryKey`·클라 `philifeFeedViewerSig` 는 null→anon / _anon이 다르므로 분리 */
  const listKeyViewerSegment = vId ?? "anon";
  const viewerKey = vId || "_anon";
  const offset = 0;
  const limit = NEIGHBORHOOD_FEED_PAGE_SIZE;
  const feedSort = "latest" as const;
  const listQueryKey = [
    "community:neighborhood-feed:list",
    listKeyViewerSegment,
    "global",
    "all",
    "all",
    "all",
    "all-users",
    String(offset),
    String(limit),
    feedSort,
  ].join(":");

  const listResult = await runSingleFlight(listQueryKey, async () =>
    listNeighborhoodFeed({
      allLocations: true,
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
    posts,
    hasMore,
    nextOffset: hasMore ? offset + pagingOffsetAdvance : null,
    pagingOffsetAdvance,
  };
}
