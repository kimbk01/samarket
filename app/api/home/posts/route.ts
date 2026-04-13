import { type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
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

export const dynamic = "force-dynamic";

/**
 * `tradeMarketParent` 없을 때 홈 「전체」를 **구성된 거래 메뉴 id 합집합**으로만 제한(정책 A).
 * 기본값 **끔**: `trade_category_id` 가 메뉴 트리와 어긋난 기존 글·관리자 목록과 동일 노출이 안 되는 문제를 막기 위함.
 * 데이터 정합 후 `.env` 에 `HOME_POSTS_CONFIGURED_TRADE_UNION=1` 로 켠다.
 */
function useConfiguredTradeUnionForHomeAll(): boolean {
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

function pruneExpiredEntries<T extends { expiresAt: number }>(cache: Map<string, T>): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function maybePruneExpiredEntries<T extends { expiresAt: number }>(cache: Map<string, T>): void {
  if (cache.size < 150) return;
  if (Math.random() < 0.08) {
    pruneExpiredEntries(cache);
  }
}

function responseHeaders(authenticated: boolean): HeadersInit {
  return {
    "Cache-Control": authenticated
      ? "private, max-age=15, stale-while-revalidate=45"
      : "public, max-age=30, stale-while-revalidate=90",
    Vary: "Cookie",
  };
}

export async function GET(req: NextRequest) {
  const clients = resolvePostsReadClients(req);
  if (!clients) {
    return NextResponse.json(
      { posts: [], hasMore: false, favoriteMap: {} },
      { headers: { "Cache-Control": "no-store" } }
    );
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
  /** `tradeMarketParent` 없을 때: 구성된 홈 칩 루트들의 합집합(정책 A) — `type` 이 거래가 아닌 경우는 건드리지 않음 */
  let effectiveType: HomePostsQueryType = type;

  if (tradeMarketParent) {
    tradeCategoryIds = await expandTradeMarketCategoryFilterIds(
      readSb as SupabaseClient<any>,
      serviceSb as SupabaseClient<any> | null,
      tradeMarketParent
    );
  } else if (useConfiguredTradeUnionForHomeAll() && (type == null || type === "trade")) {
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

      homePostsServerCache.set(cacheKey, {
        posts: pack.posts,
        hasMore: pack.hasMore,
        expiresAt: Date.now() + HOME_POSTS_SERVER_CACHE_TTL_MS,
      });
      return { posts: pack.posts, hasMore: pack.hasMore };
    });

    if (!loaded) {
      return NextResponse.json(
        { posts: [], hasMore: false, favoriteMap: {} },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    posts = loaded.posts;
    hasMore = loaded.hasMore;
  }
  const favoriteMap: Record<string, boolean> = {};
  const userId = await getOptionalAuthenticatedUserId();
  const headers = responseHeaders(Boolean(userId));

  await enrichPostsAuthorNicknamesFromProfiles(readSb as SupabaseClient<any>, posts);

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

  return NextResponse.json(
    {
      posts,
      hasMore,
      favoriteMap,
    },
    { headers }
  );
}
