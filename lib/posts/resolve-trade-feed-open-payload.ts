/**
 * 거래 마켓 목록(첫 페이지·페이지네이션) — **게시글 조회 + 로그인 시 찜 맵** 단일 파이프라인.
 * `GET /api/trade/feed` · `loadMarketBootstrapPayload` 의 `initialFeed` 가 동일 구현을 쓰게 해 드리프트를 막는다.
 */
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";
import type { JobListIndustrySlug, JobListRegionSlug } from "@/lib/jobs/job-list-url-params";
import type { PostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { fetchTradeFeedPage, type TradeFeedPageSort } from "@/lib/posts/fetch-trade-feed-page";
import { getTradeFeedFavoriteMapCached } from "@/lib/posts/trade-feed-favorites-server-cache";
import type { PostWithMeta } from "@/lib/posts/schema";
import { enrichPostsAuthorNicknamesFromProfiles } from "@/lib/posts/enrich-posts-author-nicknames";
import {
  applyTradeHomePromotionProjection,
  tradePromotionPageIndexFromRequestPage,
} from "@/lib/promotion/feed-promotion-projection";
import type { CompositionFilterClause } from "@/lib/trade/category-form/composition-filter-query";

export type TradeFeedOpenRequestOptions = {
  page: number;
  sort: TradeFeedPageSort;
  jobsListingKind?: JobListingKindFilter;
  restrictTradeTypeJob?: boolean;
  jobEmploymentType?: string;
  todayAvailable?: boolean;
  jobRegionSlug?: JobListRegionSlug;
  jobIndustrySlug?: JobListIndustrySlug;
  statusOr?: string;
  lguCityId?: string;
  radiusKm?: number | null;
  q?: string;
  priceMin?: number;
  priceMax?: number;
  compositionFilters?: CompositionFilterClause[];
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

  let result = await fetchTradeFeedPage(readSb, categoryIds, {
    page: opts.page,
    sort: opts.sort,
    jobsListingKind: opts.jobsListingKind,
    restrictTradeTypeJob: opts.restrictTradeTypeJob,
    jobEmploymentType: opts.jobEmploymentType,
    todayAvailable: opts.todayAvailable,
    jobRegionSlug: opts.jobRegionSlug,
    jobIndustrySlug: opts.jobIndustrySlug,
    statusOr: opts.statusOr,
    lguCityId: opts.lguCityId,
    radiusKm: opts.radiusKm,
    q: opts.q,
    priceMin: opts.priceMin,
    priceMax: opts.priceMax,
    compositionFilters: opts.compositionFilters,
  });
  if (
    result.posts.length === 0 &&
    serviceSb &&
    serviceSb !== readSb
  ) {
    const alt = await fetchTradeFeedPage(serviceSb, categoryIds, {
      page: opts.page,
      sort: opts.sort,
      jobsListingKind: opts.jobsListingKind,
      restrictTradeTypeJob: opts.restrictTradeTypeJob,
      jobEmploymentType: opts.jobEmploymentType,
      todayAvailable: opts.todayAvailable,
      jobRegionSlug: opts.jobRegionSlug,
      jobIndustrySlug: opts.jobIndustrySlug,
      statusOr: opts.statusOr,
      lguCityId: opts.lguCityId,
      radiusKm: opts.radiusKm,
      q: opts.q,
      priceMin: opts.priceMin,
      priceMax: opts.priceMax,
      compositionFilters: opts.compositionFilters,
    });
    if (alt.posts.length > 0) {
      result = alt;
    }
  }

  /**
   * 메뉴 분류(/market/*) 피드도 동일하게 작성자 닉네임을 보강한다.
   * - 1차: read client
   * - 2차(필요 시): service client
   */
  if (result.posts.length > 0) {
    await enrichPostsAuthorNicknamesFromProfiles(readSb as any, result.posts as PostWithMeta[]);
    if (serviceSb && serviceSb !== readSb) {
      await enrichPostsAuthorNicknamesFromProfiles(serviceSb as any, result.posts as PostWithMeta[]);
    }
  }

  const promoSb = (serviceSb ?? readSb) as any;
  const projected = await applyTradeHomePromotionProjection(promoSb, {
    pageIndex: tradePromotionPageIndexFromRequestPage(opts.page),
    posts: result.posts as PostWithMeta[],
    tradeCategoryIds: categoryIds,
  });
  result = { posts: projected.posts, hasMore: result.hasMore };

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
