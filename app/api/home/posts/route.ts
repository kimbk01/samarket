import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { PostWithMeta } from "@/lib/posts/schema";
import { normalizePostImages, normalizePostMeta, normalizePostPrice } from "@/lib/posts/post-normalize";
import { resolveAuthorIdFromPostRow } from "@/lib/posts/resolve-post-author-id";
import { enrichPostsAuthorNicknamesFromProfiles } from "@/lib/posts/enrich-posts-author-nicknames";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const HOME_POSTS_SERVER_CACHE_TTL_MS = 30_000;
const HOME_POSTS_FAVORITES_CACHE_TTL_MS = 12_000;
/**
 * 홈 피드 SELECT — 컬럼 누락 DB에서 PostgREST 오류 → 빈 목록이 되는 것을 막기 위해 순차 시도.
 * (`author_avatar_url`·`author_id` 등은 일부 posts 스키마에 없음)
 */
const HOME_POSTS_SELECT_TIERS = [
  "id, category_id, trade_category_id, user_id, author_id, type, title, price, is_free_share, is_price_offer, region, city, barangay, status, seller_listing_state, reserved_buyer_id, view_count, thumbnail_url, images, meta, created_at, updated_at, author_nickname, favorite_count, comment_count",
  "id, category_id, trade_category_id, user_id, type, title, price, is_free_share, is_price_offer, region, city, barangay, status, view_count, thumbnail_url, images, meta, created_at, updated_at, author_nickname, favorite_count, comment_count",
  "id, category_id, trade_category_id, user_id, type, title, price, is_free_share, region, city, status, view_count, thumbnail_url, images, meta, created_at, updated_at, favorite_count, comment_count",
  "id, user_id, trade_category_id, category_id, title, price, status, view_count, thumbnail_url, images, region, city, created_at, updated_at, meta, is_free_share",
  "*",
] as const;

/** hidden·sold 제외. `status` 가 NULL 인 레거시 행은 `.neq` 만으로는 SQL에서 걸러져 빠지므로 OR 로 포함 */
const HOME_POSTS_STATUS_OR = "status.is.null,status.not.in.(hidden,sold)";

type HomePostsServerCacheEntry = {
  posts: PostWithMeta[];
  hasMore: boolean;
  expiresAt: number;
};

type HomePostsFavoriteCacheEntry = {
  favoriteMap: Record<string, boolean>;
  expiresAt: number;
};

const homePostsServerCache = new Map<string, HomePostsServerCacheEntry>();
const homePostsFavoriteCache = new Map<string, HomePostsFavoriteCacheEntry>();

type HomePostSort = "latest" | "popular";
type HomePostType = "trade" | "community" | "service" | "feature" | null;

function normalizeSort(raw: string | null): HomePostSort {
  return raw === "popular" ? "popular" : "latest";
}

function normalizeType(raw: string | null): HomePostType {
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

function buildHomePostsCacheKey(page: number, sort: HomePostSort, type: HomePostType): string {
  return `${page}:${sort}:${type ?? "all"}`;
}

function buildHomePostsFavoriteCacheKey(userId: string, page: number, sort: HomePostSort, type: HomePostType): string {
  return `${userId}:${buildHomePostsCacheKey(page, sort, type)}`;
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

function mapPostRow(row: Record<string, unknown>): PostWithMeta {
  const images = normalizePostImages(row.images);
  const thumbnail_url =
    typeof row.thumbnail_url === "string" && row.thumbnail_url
      ? row.thumbnail_url
      : images?.[0] ?? null;
  const author_id = resolveAuthorIdFromPostRow(row) ?? "";
  const category_id = (row.category_id as string) ?? (row.trade_category_id as string);
  const price = normalizePostPrice(row.price);
  const meta = normalizePostMeta(row.meta);
  const is_free_share = row.is_free_share === true || row.is_free_share === "true";

  return {
    ...row,
    author_id,
    category_id,
    images,
    thumbnail_url,
    price,
    meta: meta ?? undefined,
    is_free_share,
  } as PostWithMeta;
}

export async function GET(req: NextRequest) {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json(
      { posts: [], hasMore: false, favoriteMap: {} },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const { searchParams } = new URL(req.url);
  const page = normalizePage(searchParams.get("page"));
  const sort = normalizeSort(searchParams.get("sort"));
  const type = normalizeType(searchParams.get("type"));
  const from = (page - 1) * PAGE_SIZE;
  const cacheKey = buildHomePostsCacheKey(page, sort, type);
  maybePruneExpiredEntries(homePostsServerCache);
  maybePruneExpiredEntries(homePostsFavoriteCache);

  const cachedPosts = homePostsServerCache.get(cacheKey);
  let posts: PostWithMeta[];
  let hasMore: boolean;

  if (cachedPosts && cachedPosts.expiresAt > Date.now()) {
    posts = cachedPosts.posts;
    hasMore = cachedPosts.hasMore;
  } else {
    let data: unknown[] | null = null;
    for (const selectFields of HOME_POSTS_SELECT_TIERS) {
      let q = sb.from("posts").select(selectFields).or(HOME_POSTS_STATUS_OR);
      /**
       * 레거시 DB에는 posts.type 컬럼이 없을 수 있음 — 동일 의미로 nullable 컬럼으로 필터.
       * (trade: trade_category_id, community: board_id, service: service_id)
       */
      if (type === "trade") {
        q = q.not("trade_category_id", "is", null).neq("trade_category_id", "");
      } else if (type === "community") {
        q = q.not("board_id", "is", null).neq("board_id", "");
      } else if (type === "service") {
        q = q.not("service_id", "is", null).neq("service_id", "");
      } else if (type === "feature") {
        // type 컬럼 없을 때 구분 불가 → 과필터 방지 위해 추가 제한 없음(호출처 거의 없음)
      }
      if (sort === "latest") {
        q = q.order("created_at", { ascending: false });
      } else {
        q = q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
      }

      const res = await q.range(from, from + PAGE_SIZE - 1);
      if (!res.error && Array.isArray(res.data)) {
        data = res.data;
        break;
      }
    }

    if (!data) {
      return NextResponse.json(
        { posts: [], hasMore: false, favoriteMap: {} },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    posts = data.map((row) =>
      mapPostRow(
        row && typeof row === "object" ? (row as Record<string, unknown>) : {}
      )
    );
    hasMore = posts.length === PAGE_SIZE;
    homePostsServerCache.set(cacheKey, {
      posts,
      hasMore,
      expiresAt: Date.now() + HOME_POSTS_SERVER_CACHE_TTL_MS,
    });
  }
  const favoriteMap: Record<string, boolean> = {};
  const userId = await getOptionalAuthenticatedUserId();
  const headers = responseHeaders(Boolean(userId));

  await enrichPostsAuthorNicknamesFromProfiles(sb, posts);

  if (userId && posts.length > 0) {
    const postIds = posts.map((post) => post.id).filter(Boolean);
    const favoriteCacheKey = buildHomePostsFavoriteCacheKey(userId, page, sort, type);
    const cachedFavorites = homePostsFavoriteCache.get(favoriteCacheKey);

    if (cachedFavorites && cachedFavorites.expiresAt > Date.now()) {
      Object.assign(favoriteMap, cachedFavorites.favoriteMap);
    } else {
      const { data: favorites } = await sb
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
