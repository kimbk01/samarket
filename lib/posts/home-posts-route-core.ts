/**
 * `/api/home/posts` GET 과 동일한 조회 로직 — RSC 시드와 공유해 첫 페인트 중복 요청을 줄인다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import type { PostWithMeta } from "@/lib/posts/schema";
import { enrichPostsAuthorNicknamesFromProfiles } from "@/lib/posts/enrich-posts-author-nicknames";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { resolvePostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import {
  HOME_POSTS_PAGE_SIZE,
  expandTradeMarketCategoryFilterIds,
  resolveHomePostsPayload,
  type HomePostsQuerySort,
  type HomePostsQueryType,
} from "@/lib/posts/home-posts-query-server";
import { resolveTradeMarketParentParam } from "@/lib/posts/resolve-trade-market-parent-param";
import { expandTradeCategoryIdsForAllConfiguredHomeRoots } from "@/lib/trade/trade-market-catalog";
/** `HOME_POSTS_CONFIGURED_TRADE_UNION` — React 훅 아님(이름 `use*` 금지: eslint react-hooks/rules-of-hooks) */
function isConfiguredTradeUnionEnabledForHomeAll(): boolean {
  const v = (process.env.HOME_POSTS_CONFIGURED_TRADE_UNION ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const HOME_POSTS_SERVER_CACHE_TTL_MS = 30_000;
const HOME_POSTS_FAVORITES_CACHE_TTL_MS = 12_000;

const homePostsServerCache = new Map<
  string,
  { posts: PostWithMeta[]; hasMore: boolean; expiresAt: number }
>();
const homePostsFavoriteCache = new Map<
  string,
  { favoriteMap: Record<string, boolean>; expiresAt: number }
>();

function normalizeSort(raw: string | null): HomePostsQuerySort {
  return raw === "popular" ? "popular" : "latest";
}

function normalizeType(raw: string | null): HomePostsQueryType {
  if (raw === "trade" || raw === "community" || raw === "service" || raw === "feature") {
    return raw;
  }
  return null;
}

function normalizePage(raw: string | null): number {
  const page = Number(raw);
  if (!Number.isFinite(page)) return 1;
  return Math.max(1, Math.floor(page));
}

function buildHomePostsCacheKey(
  page: number,
  sort: HomePostsQuerySort,
  type: HomePostsQueryType,
  marketSegment: string
): string {
  return `${page}:${sort}:${type ?? "all"}:m:${marketSegment}`;
}

function buildHomePostsFavoriteCacheKey(
  userId: string,
  page: number,
  sort: HomePostsQuerySort,
  type: HomePostsQueryType,
  marketSegment: string
): string {
  return `${userId}:${buildHomePostsCacheKey(page, sort, type, marketSegment)}`;
}

function maybePruneExpiredEntries<T extends { expiresAt: number }>(cache: Map<string, T>): void {
  if (cache.size < 150) return;
  if (Math.random() < 0.08) {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key);
    }
  }
}

export type HomePostsOpenResult = {
  posts: PostWithMeta[];
  hasMore: boolean;
  favoriteMap: Record<string, boolean>;
};

export type ResolveHomePostsGetDataOptions = {
  /**
   * 이미 같은 요청(`req` 쿠키 맥락)에서 `getOptionalAuthenticatedUserId()`로 확정한 뷰어 ID.
   * - 속성을 생략하거나 값이 `undefined`이면 이 함수 안에서 세션을 한 번 조회한다.
   * - `null`(비로그인) 또는 비어 있지 않은 문자열이면 그대로 쓰며 세션을 다시 열지 않는다.
   *   (`GET /api/home/posts` 가 헤더용 인증과 favorites용 인증을 한 갈래로 맞추기 위함.)
   */
  precomputedViewerUserId?: string | null;
};

/**
 * GET /api/home/posts 와 동일 페이로드. Supabase 미구성 시 빈 결과.
 */
export async function resolveHomePostsGetData(
  req: NextRequest,
  options?: ResolveHomePostsGetDataOptions
): Promise<HomePostsOpenResult> {
  const clients = resolvePostsReadClients(req);
  if (!clients) {
    return { posts: [], hasMore: false, favoriteMap: {} };
  }
  const { readSb, serviceSb, favoritesSb } = clients;

  const { searchParams } = new URL(req.url);
  const page = normalizePage(searchParams.get("page"));
  const sort = normalizeSort(searchParams.get("sort"));
  const type = normalizeType(searchParams.get("type"));
  const tradeMarketParent = await resolveTradeMarketParentParam(
    readSb as SupabaseClient<any>,
    searchParams.get("tradeMarketParent")
  );

  let tradeCategoryIds: string[] | null = null;
  let effectiveType: HomePostsQueryType = type;

  if (tradeMarketParent) {
    tradeCategoryIds = await expandTradeMarketCategoryFilterIds(
      readSb as SupabaseClient<any>,
      serviceSb as SupabaseClient<any> | null,
      tradeMarketParent
    );
  } else if (isConfiguredTradeUnionEnabledForHomeAll() && (type == null || type === "trade")) {
    const union = await expandTradeCategoryIdsForAllConfiguredHomeRoots(
      readSb as SupabaseClient<any>,
      serviceSb as SupabaseClient<any> | null
    );
    if (union.length > 0) {
      tradeCategoryIds = union;
      effectiveType = "trade";
    }
  }

  const marketSegment = tradeMarketParent
    ? tradeMarketParent
    : tradeCategoryIds && tradeCategoryIds.length > 0
      ? "configured_trade_union"
      : "all";
  const from = (page - 1) * HOME_POSTS_PAGE_SIZE;
  const cacheKey = buildHomePostsCacheKey(page, sort, effectiveType, marketSegment);
  maybePruneExpiredEntries(homePostsServerCache);
  maybePruneExpiredEntries(homePostsFavoriteCache);

  const cachedPosts = homePostsServerCache.get(cacheKey);
  let posts: PostWithMeta[];
  let hasMore: boolean;

  if (cachedPosts && cachedPosts.expiresAt > Date.now()) {
    posts = cachedPosts.posts;
    hasMore = cachedPosts.hasMore;
  } else {
    const loaded = await runSingleFlight(`api:home-posts:${cacheKey}`, async () => {
      const again = homePostsServerCache.get(cacheKey);
      if (again && again.expiresAt > Date.now()) {
        return { posts: again.posts, hasMore: again.hasMore };
      }

      const pack = await resolveHomePostsPayload(
        readSb as SupabaseClient<any>,
        serviceSb as SupabaseClient<any> | null,
        from,
        sort,
        effectiveType,
        tradeCategoryIds
      );
      if (!pack) {
        return null;
      }

      /** 캐시에 넣기 전 닉네임 보강 — TTL 동안 요청마다 `profiles` 재조회하지 않음 */
      await enrichPostsAuthorNicknamesFromProfiles(readSb as SupabaseClient<any>, pack.posts);

      homePostsServerCache.set(cacheKey, {
        posts: pack.posts,
        hasMore: pack.hasMore,
        expiresAt: Date.now() + HOME_POSTS_SERVER_CACHE_TTL_MS,
      });
      return { posts: pack.posts, hasMore: pack.hasMore };
    });

    if (!loaded) {
      return { posts: [], hasMore: false, favoriteMap: {} };
    }

    posts = loaded.posts;
    hasMore = loaded.hasMore;
  }
  const favoriteMap: Record<string, boolean> = {};
  const preViewer = options?.precomputedViewerUserId;
  const userId =
    preViewer !== undefined ? preViewer : await getOptionalAuthenticatedUserId();

  if (userId && posts.length > 0) {
    const postIds = posts.map((post) => post.id).filter(Boolean);
    const favoriteCacheKey = buildHomePostsFavoriteCacheKey(userId, page, sort, effectiveType, marketSegment);
    const cachedFavorites = homePostsFavoriteCache.get(favoriteCacheKey);

    if (cachedFavorites && cachedFavorites.expiresAt > Date.now()) {
      Object.assign(favoriteMap, cachedFavorites.favoriteMap);
    } else {
      const { data: favorites } = await favoritesSb
        .from("favorites")
        .select("post_id")
        .eq("user_id", userId)
        .in("post_id", postIds);

      for (const postId of postIds) {
        favoriteMap[postId] = false;
      }
      for (const row of favorites ?? []) {
        const postId = typeof row.post_id === "string" ? row.post_id : "";
        if (postId) favoriteMap[postId] = true;
      }

      homePostsFavoriteCache.set(favoriteCacheKey, {
        favoriteMap: { ...favoriteMap },
        expiresAt: Date.now() + HOME_POSTS_FAVORITES_CACHE_TTL_MS,
      });
    }
  }

  return {
    posts,
    hasMore,
    favoriteMap,
  };
}
