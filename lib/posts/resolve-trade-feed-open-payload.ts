/**
 * 거래 마켓 목록(첫 페이지·페이지네이션) — **게시글 조회 + 로그인 시 찜 맵** 단일 파이프라인.
 * `GET /api/trade/feed` · `loadMarketBootstrapPayload` 의 `initialFeed` 가 동일 구현을 쓰게 해 드리프트를 막는다.
 */
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";
import type { PostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { fetchTradeFeedPage, type TradeFeedPageSort } from "@/lib/posts/fetch-trade-feed-page";
import { getTradeFeedFavoriteMapCached } from "@/lib/posts/trade-feed-favorites-server-cache";
import type { PostWithMeta } from "@/lib/posts/schema";

export type TradeFeedOpenRequestOptions = {
  page: number;
  sort: TradeFeedPageSort;
  jobsListingKind?: JobListingKindFilter;
};

export type TradeFeedOpenPayload = {
  posts: PostWithMeta[];
  hasMore: boolean;
  /** 로그인·글 있음일 때만 채움 — 비로그인은 `{}` */
  favoriteMap: Record<string, boolean>;
};

/**
 * `categoryIds` 는 이미 OR 필터용으로 확정된 id 목록(부모+주제 펼침 후).
 */
export async function resolveTradeFeedOpenPayload(
  clients: PostsReadClients,
  categoryIds: string[],
  opts: TradeFeedOpenRequestOptions,
  viewerUserId: string | null | undefined
): Promise<TradeFeedOpenPayload> {
  const { readSb, serviceSb, favoritesSb } = clients;

  let result = await fetchTradeFeedPage(readSb, categoryIds, opts);
  if (
    result.posts.length === 0 &&
    serviceSb &&
    serviceSb !== readSb
  ) {
    const alt = await fetchTradeFeedPage(serviceSb, categoryIds, opts);
    if (alt.posts.length > 0) {
      result = alt;
    }
  }

  let favoriteMap: Record<string, boolean> = {};
  const viewer = viewerUserId?.trim();
  if (viewer && result.posts.length > 0) {
    favoriteMap = await getTradeFeedFavoriteMapCached(
      favoritesSb,
      viewer,
      result.posts.map((p) => p.id)
    );
  }

  return {
    posts: result.posts as PostWithMeta[],
    hasMore: result.hasMore,
    favoriteMap,
  };
}
