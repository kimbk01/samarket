/**
 * `/api/home/posts` 조회 코어.
 * 거래 `trade_category_id` 필터 문자열은 마켓 피드와 동일 규칙·청크(`trade-posts-category-filter`).
 * 마켓 탭 목록 단일 소스는 `fetchPostsRangeForTradeCategories` / `GET /api/trade/feed` — `docs/trade-market-feed-contract.md`.
 */
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import { normalizePostImages, normalizePostMeta, normalizePostPrice } from "@/lib/posts/post-normalize";
import { resolveAuthorIdFromPostRow } from "@/lib/posts/resolve-post-author-id";
import { applyPostgrestAndGroup } from "@/lib/posts/apply-postgrest-and-group";
import { buildTradePostsStatusAndCategoryAndFilter } from "@/lib/posts/trade-posts-category-filter";
import { expandTradeCategoryIdsForRoot } from "@/lib/trade/trade-market-catalog";
import { POST_TRADE_LIST_SELECT } from "@/lib/posts/trade-posts-range-query";

export const HOME_POSTS_PAGE_SIZE = 50;

/**
 * 컬럼 집합은 `POST_TRADE_LIST_SELECT`(OpenAPI `posts` 정의)와 동일 계열.
 * `category_id` / `author_id` / `author_nickname` / `comment_count` 등 스키마에 없는 컬럼은 넣지 않음.
 */
export const HOME_POSTS_SELECT_TIERS = [
  `${POST_TRADE_LIST_SELECT},community_topic_id,is_deleted`,
  `${POST_TRADE_LIST_SELECT},community_topic_id`,
  POST_TRADE_LIST_SELECT,
  "id, user_id, type, trade_category_id, title, price, status, view_count, thumbnail_url, images, region, city, created_at, updated_at, meta, is_free_share, is_price_offer",
  "*",
] as const;

export const HOME_POSTS_STATUS_OR = "status.is.null,status.not.in.(hidden,sold)";
export type HomePostsTradeStateFilter = "latest" | "active" | "reserved" | "sold";

export type HomePostsQuerySort = "latest" | "popular";
export type HomePostsQueryType = "trade" | "community" | "service" | "feature" | null;

export function resolveHomePostsStatusOrByTradeState(
  tradeState: HomePostsTradeStateFilter
): string {
  switch (tradeState) {
    case "active":
      return "status.is.null,status.eq.active";
    case "reserved":
      return "status.eq.reserved";
    case "sold":
      return "status.eq.sold";
    case "latest":
    default:
      return HOME_POSTS_STATUS_OR;
  }
}

export function mapPostRowForHome(row: Record<string, unknown>): PostWithMeta {
  const images = normalizePostImages(row.images);
  const thumbnail_url =
    typeof row.thumbnail_url === "string" && row.thumbnail_url
      ? row.thumbnail_url
      : images?.[0] ?? null;
  const author_id = resolveAuthorIdFromPostRow(row) ?? "";
  const category_id =
    (typeof row.trade_category_id === "string" && row.trade_category_id.trim()
      ? row.trade_category_id
      : null) ?? "";
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

/** 홈 `tradeMarketParent` 와 마켓 1차 메뉴 — `lib/trade/trade-market-catalog` 의 `expandTradeCategoryIdsForRoot` 와 동일 */
export async function expandTradeMarketCategoryFilterIds(
  readSb: SupabaseClient<any>,
  serviceSb: SupabaseClient<any> | null,
  parentId: string
): Promise<string[]> {
  return expandTradeCategoryIdsForRoot(readSb, serviceSb, parentId);
}

export async function loadHomePostsPage(
  sb: SupabaseClient<any>,
  table: string,
  from: number,
  sort: HomePostsQuerySort,
  type: HomePostsQueryType,
  tradeCategoryIds: string[] | null,
  statusOr: string
): Promise<{ posts: PostWithMeta[]; hasMore: boolean } | null> {
  let data: unknown[] | null = null;

  outer: for (const selectFields of HOME_POSTS_SELECT_TIERS) {
    let q = sb.from(table).select(selectFields);
    if (tradeCategoryIds?.length) {
      const andGroup = buildTradePostsStatusAndCategoryAndFilter(tradeCategoryIds, statusOr);
      if (!andGroup) {
        return { posts: [], hasMore: false };
      }
      applyPostgrestAndGroup(q as unknown as { url: URL }, andGroup);
    } else {
      q = q.or(statusOr);
    }
    if (type === "trade") {
      q = q.not("trade_category_id", "is", null).neq("trade_category_id", "");
    } else if (type === "community") {
      q = q.eq("type", "community");
    } else if (type === "service") {
      q = q.eq("type", "service");
    } else if (type === "feature") {
      // no-op
    }
    if (sort === "latest") {
      q = q.order("created_at", { ascending: false });
    } else {
      q = q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
    }

    const res = await q.range(from, from + HOME_POSTS_PAGE_SIZE - 1);
    if (!res.error && Array.isArray(res.data)) {
      data = res.data;
      break outer;
    }
  }

  if (!data) return null;

  const mapped = data.map((row) =>
    mapPostRowForHome(row && typeof row === "object" ? (row as Record<string, unknown>) : {})
  );
  const hasMoreFlag = mapped.length === HOME_POSTS_PAGE_SIZE;
  return { posts: mapped, hasMore: hasMoreFlag };
}

export async function resolveHomePostsPayload(
  readSb: SupabaseClient<any>,
  serviceSb: SupabaseClient<any> | null,
  from: number,
  sort: HomePostsQuerySort,
  type: HomePostsQueryType,
  tradeCategoryIds: string[] | null,
  statusOr: string
): Promise<{ posts: PostWithMeta[]; hasMore: boolean } | null> {
  const fromMaskedRead = await loadHomePostsPage(readSb, POSTS_TABLE_READ, from, sort, type, tradeCategoryIds, statusOr);
  if (fromMaskedRead) return fromMaskedRead;

  if (serviceSb && serviceSb !== readSb) {
    const fromMaskedService = await loadHomePostsPage(
      serviceSb,
      POSTS_TABLE_READ,
      from,
      sort,
      type,
      tradeCategoryIds,
      statusOr
    );
    if (fromMaskedService) return fromMaskedService;
  }

  if (serviceSb) {
    return loadHomePostsPage(serviceSb, "posts", from, sort, type, tradeCategoryIds, statusOr);
  }

  return null;
}
