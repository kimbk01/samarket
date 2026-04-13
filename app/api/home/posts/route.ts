import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

import { type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import type { PostWithMeta } from "@/lib/posts/schema";
import { normalizePostImages, normalizePostMeta, normalizePostPrice } from "@/lib/posts/post-normalize";
import { resolveAuthorIdFromPostRow } from "@/lib/posts/resolve-post-author-id";
import { enrichPostsAuthorNicknamesFromProfiles } from "@/lib/posts/enrich-posts-author-nicknames";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { resolvePostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { fetchTradeCategoryDescendantNodes } from "@/lib/market/trade-category-subtree";
import { applyPostgrestAndGroup } from "@/lib/posts/apply-postgrest-and-group";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const HOME_POSTS_SERVER_CACHE_TTL_MS = 30_000;
const HOME_POSTS_FAVORITES_CACHE_TTL_MS = 12_000;

const HOME_POSTS_SELECT_TIERS = [
  "id, category_id, trade_category_id, user_id, author_id, type, title, price, is_free_share, is_price_offer, region, city, status, seller_listing_state, reserved_buyer_id, view_count, thumbnail_url, images, meta, created_at, updated_at, author_nickname, favorite_count, comment_count",
  "id, category_id, trade_category_id, user_id, type, title, price, is_free_share, is_price_offer, region, city, status, view_count, thumbnail_url, images, meta, created_at, updated_at, author_nickname, favorite_count, comment_count",
  "id, category_id, trade_category_id, user_id, type, title, price, is_free_share, region, city, status, view_count, thumbnail_url, images, meta, created_at, updated_at, favorite_count, comment_count",
  "id, user_id, trade_category_id, category_id, title, price, status, view_count, thumbnail_url, images, region, city, created_at, updated_at, meta, is_free_share",
  "*",
] as const;

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

/** `tradeMarketParent` 쿼리 — UUID */
function normalizeTradeMarketParent(raw: string | null): string | null {
  const t = raw?.trim() ?? "";
  if (!t) return null;
  if (!/^[0-9a-f-]{36}$/i.test(t)) return null;
  return t;
}

function buildHomePostsCacheKey(
  page: number,
  sort: HomePostSort,
  type: HomePostType,
  marketSegment: string
): string {
  return `${page}:${sort}:${type ?? "all"}:m:${marketSegment}`;
}

function buildHomePostsFavoriteCacheKey(
  userId: string,
  page: number,
  sort: HomePostSort,
  type: HomePostType,
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

async function expandTradeMarketCategoryFilterIds(
  readSb: SupabaseClient<any>,
  serviceSb: SupabaseClient<any> | null,
  parentId: string
): Promise<string[]> {
  const pid = parentId.trim();
  const qsb = serviceSb ?? readSb;
  const descendants = await fetchTradeCategoryDescendantNodes(qsb, pid);
  const descIds = descendants.map((d) => d.id).filter(Boolean);
  return [...new Set([pid, ...descIds])];
}

async function loadHomePostsPage(
  sb: SupabaseClient<any>,
  table: string,
  from: number,
  sort: HomePostSort,
  type: HomePostType,
  tradeCategoryIds: string[] | null
): Promise<{ posts: PostWithMeta[]; hasMore: boolean } | null> {
  let data: unknown[] | null = null;

  outer: for (const selectFields of HOME_POSTS_SELECT_TIERS) {
    let q = sb.from(table).select(selectFields);
    if (tradeCategoryIds?.length) {
      const idCsv = tradeCategoryIds.join(",");
      /** `.or()` 연쇄 시 PostgREST `or` 파라미터가 덮일 수 있어 `and=(or(상태),or(카테고리))` 로 단일화 */
      applyPostgrestAndGroup(q as unknown as { url: URL }, `(or(${HOME_POSTS_STATUS_OR}),or(trade_category_id.in.(${idCsv}),category_id.in.(${idCsv})))`);
    } else {
      q = q.or(HOME_POSTS_STATUS_OR);
    }
    if (type === "trade") {
      q = q.not("trade_category_id", "is", null).neq("trade_category_id", "");
    } else if (type === "community") {
      q = q.not("board_id", "is", null).neq("board_id", "");
    } else if (type === "service") {
      q = q.not("service_id", "is", null).neq("service_id", "");
    } else if (type === "feature") {
      // no-op
    }
    if (sort === "latest") {
      q = q.order("created_at", { ascending: false });
    } else {
      q = q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
    }

    const res = await q.range(from, from + PAGE_SIZE - 1);
    if (!res.error && Array.isArray(res.data)) {
      data = res.data;
      break outer;
    }
  }

  if (!data) return null;

  const mapped = data.map((row) =>
    mapPostRow(row && typeof row === "object" ? (row as Record<string, unknown>) : {})
  );
  const hasMoreFlag = mapped.length === PAGE_SIZE;
  return { posts: mapped, hasMore: hasMoreFlag };
}

async function resolveHomePostsPayload(
  readSb: SupabaseClient<any>,
  serviceSb: SupabaseClient<any> | null,
  from: number,
  sort: HomePostSort,
  type: HomePostType,
  tradeCategoryIds: string[] | null
): Promise<{ posts: PostWithMeta[]; hasMore: boolean } | null> {
  const fromMaskedRead = await loadHomePostsPage(readSb, POSTS_TABLE_READ, from, sort, type, tradeCategoryIds);
  if (fromMaskedRead) return fromMaskedRead;

  if (serviceSb && serviceSb !== readSb) {
    const fromMaskedService = await loadHomePostsPage(
      serviceSb,
      POSTS_TABLE_READ,
      from,
      sort,
      type,
      tradeCategoryIds
    );
    if (fromMaskedService) return fromMaskedService;
  }

  if (serviceSb) {
    return loadHomePostsPage(serviceSb, "posts", from, sort, type, tradeCategoryIds);
  }

  return null;
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
  const tradeMarketParent = normalizeTradeMarketParent(searchParams.get("tradeMarketParent"));

  let tradeCategoryIds: string[] | null = null;
  if (tradeMarketParent) {
    tradeCategoryIds = await expandTradeMarketCategoryFilterIds(readSb, serviceSb, tradeMarketParent);
  }

  const marketSegment = tradeMarketParent ?? "all";
  const from = (page - 1) * PAGE_SIZE;
  const cacheKey = buildHomePostsCacheKey(page, sort, type, marketSegment);
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

      const pack = await resolveHomePostsPayload(readSb, serviceSb, from, sort, type, tradeCategoryIds);
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

  await enrichPostsAuthorNicknamesFromProfiles(readSb, posts);

  if (userId && posts.length > 0) {
    const postIds = posts.map((post) => post.id).filter(Boolean);
    const favoriteCacheKey = buildHomePostsFavoriteCacheKey(userId, page, sort, type, marketSegment);
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
