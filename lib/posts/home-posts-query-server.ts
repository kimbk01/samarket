/**
 * `/api/philife/posts` 조회 코어.
 * 거래 `trade_category_id` 필터 문자열은 마켓 피드와 동일 규칙·청크(`trade-posts-category-filter`).
 * 마켓 탭 목록 단일 소스는 `fetchPostsRangeForTradeCategories` / `GET /api/trade/feed` — `docs/trade-market-feed-contract.md`.
 */
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import { normalizePostImages, normalizePostMeta, normalizePostPrice } from "@/lib/posts/post-normalize";
import { resolveAuthorIdFromPostRow } from "@/lib/posts/resolve-post-author-id";
import { applyPostgrestAndGroup } from "@/lib/posts/apply-postgrest-and-group";
import {
  buildTradePostsStatusAndCategoryAndFilter,
  buildTradePostsStatusAndTradeCategoryOnlyAndFilter,
} from "@/lib/posts/trade-posts-category-filter";
import { expandTradeCategoryIdsForRoot } from "@/lib/trade/trade-market-catalog";
import {
  POST_TRADE_LIST_SELECT,
  applyResolvedTradeFeedLocationToQuery,
} from "@/lib/posts/trade-posts-range-query";
import { resolveTradeFeedLocationConstraint } from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { tradeFeedLocationToQueryExtras } from "@/lib/trade/location/national/trade-feed-location-query-extras";
import { applyMarketplaceQueryToPostgrest } from "@/lib/trade/marketplace/query-contract";
import {
  applyCompositionFilterClausesToPostgrest,
  type CompositionFilterClause,
} from "@/lib/trade/category-form/composition-filter-query";
import {
  MARKETPLACE_DISTANCE_SCAN_CAP,
  sortListingsByLguDistance,
} from "@/lib/trade/marketplace/sort-listings-by-lgu-distance";

export const HOME_POSTS_PAGE_SIZE = 50;

/**
 * 컬럼 집합은 `POST_TRADE_LIST_SELECT`(OpenAPI `posts` 정의)와 동일 계열.
 * `category_id` / `author_id` / `author_nickname` / `comment_count` 등 스키마에 없는 컬럼은 넣지 않음.
 */
export const HOME_POSTS_SELECT_TIERS = [
  `${POST_TRADE_LIST_SELECT},community_topic_id,is_deleted`,
  `${POST_TRADE_LIST_SELECT},community_topic_id`,
  POST_TRADE_LIST_SELECT,
  "id, user_id, type, trade_category_id, title, price, status, view_count, thumbnail_url, images, region, city, trade_lgu_id, created_at, updated_at, meta, is_free_share, is_price_offer",
  "*",
] as const;

export const HOME_POSTS_STATUS_OR = "status.is.null,status.not.in.(hidden,sold)";
export type HomePostsTradeStateFilter = "latest" | "active" | "reserved" | "sold";

export type HomePostsQuerySort = "latest" | "popular" | "distance";
export type HomePostsQueryType = "trade" | "community" | "service" | "feature" | null;

export function resolveHomePostsStatusOrByTradeState(
  tradeState: HomePostsTradeStateFilter
): string {
  switch (tradeState) {
    case "sold":
      return "status.eq.sold";
    case "active":
    case "reserved":
    case "latest":
    default:
      /** Public ACTIVE = not hidden/sold. L0 reserved stays in latest/active. */
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
  statusOr: string,
  lguCityId?: string | null,
  radiusKm?: number | null,
  queryExtras?: {
    q?: string;
    priceMin?: number;
    priceMax?: number;
    compositionFilters?: CompositionFilterClause[];
  }
): Promise<{ posts: PostWithMeta[]; hasMore: boolean } | null> {
  let data: unknown[] | null = null;
  const feedConstraint = resolveTradeFeedLocationConstraint(lguCityId, radiusKm);
  if (feedConstraint.kind === "invalid") {
    return { posts: [], hasMore: false };
  }
  const feedLocExtras = tradeFeedLocationToQueryExtras(feedConstraint);
  const useDistance = sort === "distance" && feedConstraint.kind === "lgu";
  const rangeFrom = useDistance ? 0 : from;
  const rangeTo = useDistance
    ? MARKETPLACE_DISTANCE_SCAN_CAP - 1
    : from + HOME_POSTS_PAGE_SIZE - 1;

  const applyHomePostsRowFilters = (q: any) => {
    if (type === "trade" && !(tradeCategoryIds && tradeCategoryIds.length > 0)) {
      /** Union already scopes by trade_category_id. Extra neq("") breaks PostgREST + type=trade. */
      q = q.not("trade_category_id", "is", null);
    } else if (type === "community") {
      q = q.eq("type", "community");
    } else if (type === "service") {
      q = q.eq("type", "service");
    } else if (type === "feature") {
      // no-op
    }
    if (feedLocExtras) {
      q = applyResolvedTradeFeedLocationToQuery(q, feedLocExtras);
    }
    q = applyMarketplaceQueryToPostgrest(q, {
      q: queryExtras?.q,
      priceMin: queryExtras?.priceMin,
      priceMax: queryExtras?.priceMax,
    });
    q = applyCompositionFilterClausesToPostgrest(q, queryExtras?.compositionFilters);
    if (sort === "popular") {
      q = q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
    } else {
      q = q.order("created_at", { ascending: false });
    }
    return q;
  };

  const runHomePostsSelect = async (selectFields: string, andGroup: string | null) => {
    let q = sb.from(table).select(selectFields);
    if (andGroup) {
      applyPostgrestAndGroup(q as unknown as { url: URL }, andGroup);
    } else {
      q = q.or(statusOr);
    }
    q = applyHomePostsRowFilters(q);
    return q.range(rangeFrom, rangeTo);
  };

  outer: for (const selectFields of HOME_POSTS_SELECT_TIERS) {
    const dualAnd = tradeCategoryIds?.length
      ? buildTradePostsStatusAndCategoryAndFilter(tradeCategoryIds, statusOr)
      : null;
    if (tradeCategoryIds?.length && !dualAnd) {
      return { posts: [], hasMore: false };
    }
    const res = await runHomePostsSelect(selectFields, dualAnd);
    if (!res.error && Array.isArray(res.data)) {
      data = res.data;
      break outer;
    }
    /**
     * Same fallback as `fetchPostsRangeForTradeCategories`: posts has no `category_id`.
     * Dual-column `and` then empties every HOME select tier (tradeMarketParent → 0 rows).
     */
    if (
      tradeCategoryIds?.length &&
      res.error &&
      typeof res.error.message === "string" &&
      /category_id/i.test(res.error.message)
    ) {
      const fallbackAnd = buildTradePostsStatusAndTradeCategoryOnlyAndFilter(
        tradeCategoryIds,
        statusOr
      );
      if (!fallbackAnd) {
        return { posts: [], hasMore: false };
      }
      const retry = await runHomePostsSelect(selectFields, fallbackAnd);
      if (!retry.error && Array.isArray(retry.data)) {
        data = retry.data;
        break outer;
      }
    }
  }

  if (!data) return null;

  const mapped = data.map((row) =>
    mapPostRowForHome(row && typeof row === "object" ? (row as Record<string, unknown>) : {})
  );
  if (useDistance && feedConstraint.kind === "lgu") {
    const sorted = sortListingsByLguDistance(mapped, feedConstraint.canonicalId);
    const page = sorted.slice(from, from + HOME_POSTS_PAGE_SIZE);
    return {
      posts: page,
      hasMore:
        sorted.length > from + HOME_POSTS_PAGE_SIZE ||
        mapped.length >= MARKETPLACE_DISTANCE_SCAN_CAP,
    };
  }
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
  statusOr: string,
  lguCityId?: string | null,
  radiusKm?: number | null,
  queryExtras?: {
    q?: string;
    priceMin?: number;
    priceMax?: number;
    compositionFilters?: CompositionFilterClause[];
  }
): Promise<{ posts: PostWithMeta[]; hasMore: boolean } | null> {
  const fromMaskedRead = await loadHomePostsPage(
    readSb,
    POSTS_TABLE_READ,
    from,
    sort,
    type,
    tradeCategoryIds,
    statusOr,
    lguCityId,
    radiusKm,
    queryExtras
  );
  if (fromMaskedRead) return fromMaskedRead;

  if (serviceSb && serviceSb !== readSb) {
    const fromMaskedService = await loadHomePostsPage(
      serviceSb,
      POSTS_TABLE_READ,
      from,
      sort,
      type,
      tradeCategoryIds,
      statusOr,
      lguCityId,
      radiusKm,
      queryExtras
    );
    if (fromMaskedService) return fromMaskedService;
  }

  if (serviceSb) {
    return loadHomePostsPage(
      serviceSb,
      "posts",
      from,
      sort,
      type,
      tradeCategoryIds,
      statusOr,
      lguCityId,
      radiusKm,
      queryExtras
    );
  }

  return null;
}
