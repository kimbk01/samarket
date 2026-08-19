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
  POSTGREST_TRADE_CATEGORY_IN_CHUNK_SIZE,
} from "@/lib/posts/trade-posts-category-filter";
import { expandTradeCategoryIdsForRoot } from "@/lib/trade/trade-market-catalog";
import {
  POST_TRADE_LIST_SELECT,
  applyResolvedTradeFeedLocationToQuery,
  type TradeFeedQueryExtras,
} from "@/lib/posts/trade-posts-range-query";
import { resolveTradeFeedLocationConstraint } from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import {
  filterPostsOutsideBrowseAnchor,
  shouldUseRegionAllBrowsePriority,
  tradeFeedLocationSqlExtras,
} from "@/lib/trade/location/national/trade-feed-location-sql-extras";
import { tradeFeedLocationToQueryExtras } from "@/lib/trade/location/national/trade-feed-location-query-extras";
import { applyMarketplaceQueryToPostgrest, sanitizeMarketplaceQueryText } from "@/lib/trade/marketplace/query-contract";
import {
  applyCompositionFilterClausesToPostgrest,
  type CompositionFilterClause,
} from "@/lib/trade/category-form/composition-filter-query";
import { buildMixedDiscoverySellIntentClauses } from "@/lib/trade/marketplace/sell-intent-list-ssot";
import {
  MARKETPLACE_DISTANCE_SCAN_CAP,
  sortListingsByLguDistance,
} from "@/lib/trade/marketplace/sort-listings-by-lgu-distance";
import {
  SEARCH_EXPANSION_EXACT_BATCH,
  SEARCH_EXPANSION_RELATED_IN_BATCH,
  SEARCH_EXPANSION_RELATED_OUT_BATCH,
  advanceSearchExpansionCursor,
  assembleSearchExpansionRound,
  buildSearchExpansionRelatedOrFilter,
  inferBodyTypesFromListings,
  resolveSearchExpansionHints,
  type SearchExpansionCursor,
} from "@/lib/trade/marketplace/search-candidate-expansion";

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

type HomePostsQueryExtras = {
  q?: string;
  priceMin?: number;
  priceMax?: number;
  compositionFilters?: CompositionFilterClause[];
  mixedDiscoverySellIntent?: boolean;
  /** category priority (hard-gate 없이 tier ordering에만 사용) */
  categoryPriorityRootTradeCategoryIds?: string[] | null;
  /** optional child(topic) priority (root-level fallback은 rootSet에서 tier ordering) */
  categoryPriorityTopicTradeCategoryIds?: string[] | null;
};

type HomePostsRangeFilterOpts = {
  applyTitleQuery?: boolean;
  applyLocation?: boolean;
  relatedOr?: string | null;
  excludeLguIds?: string[] | null;
  excludeTradeCategoryIds?: string[] | null;
};

async function fetchHomePostsMappedRange(
  sb: SupabaseClient<any>,
  table: string,
  sort: HomePostsQuerySort,
  type: HomePostsQueryType,
  tradeCategoryIds: string[] | null,
  statusOr: string,
  feedLocExtras: TradeFeedQueryExtras["tradeFeedLocation"],
  queryExtras: HomePostsQueryExtras | undefined,
  rangeFrom: number,
  rangeTo: number,
  filterOpts?: HomePostsRangeFilterOpts
): Promise<PostWithMeta[] | null> {
  let data: unknown[] | null = null;
  const applyTitleQuery = filterOpts?.applyTitleQuery !== false;
  const applyLocation = filterOpts?.applyLocation !== false;
  const applyHomePostsRowFilters = (q: any) => {
    if (type === "trade" && !(tradeCategoryIds && tradeCategoryIds.length > 0)) {
      q = q.not("trade_category_id", "is", null);
    } else if (type === "community") {
      q = q.eq("type", "community");
    } else if (type === "service") {
      q = q.eq("type", "service");
    } else if (type === "feature") {
      // no-op
    }
    if (applyLocation && feedLocExtras) {
      q = applyResolvedTradeFeedLocationToQuery(q, feedLocExtras);
    }
    if (filterOpts?.excludeLguIds && filterOpts.excludeLguIds.length > 0) {
      q = q.not("trade_lgu_id", "in", `(${filterOpts.excludeLguIds.join(",")})`);
    }
    if (filterOpts?.excludeTradeCategoryIds && filterOpts.excludeTradeCategoryIds.length > 0) {
      const cleaned = [...new Set(filterOpts.excludeTradeCategoryIds.map((x) => x.trim()).filter(Boolean))];
      for (let i = 0; i < cleaned.length; i += POSTGREST_TRADE_CATEGORY_IN_CHUNK_SIZE) {
        const chunk = cleaned.slice(i, i + POSTGREST_TRADE_CATEGORY_IN_CHUNK_SIZE);
        q = q.not("trade_category_id", "in", `(${chunk.join(",")})`);
      }
    }
    q = applyMarketplaceQueryToPostgrest(q, {
      q: applyTitleQuery ? queryExtras?.q : undefined,
      priceMin: queryExtras?.priceMin,
      priceMax: queryExtras?.priceMax,
    });
    if (filterOpts?.relatedOr) {
      q = q.or(filterOpts.relatedOr);
    }
    const compositionFilters = [
      ...(queryExtras?.compositionFilters ?? []),
      ...(queryExtras?.mixedDiscoverySellIntent ? buildMixedDiscoverySellIntentClauses() : []),
    ];
    q = applyCompositionFilterClausesToPostgrest(q, compositionFilters);
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
      return [];
    }
    const res = await runHomePostsSelect(selectFields, dualAnd);
    if (!res.error && Array.isArray(res.data)) {
      data = res.data;
      break outer;
    }
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
        return [];
      }
      const retry = await runHomePostsSelect(selectFields, fallbackAnd);
      if (!retry.error && Array.isArray(retry.data)) {
        data = retry.data;
        break outer;
      }
    }
  }

  if (!data) return null;
  return data.map((row) =>
    mapPostRowForHome(row && typeof row === "object" ? (row as Record<string, unknown>) : {})
  );
}

function partitionPostsByCategoryPriority(
  posts: PostWithMeta[],
  rootSet: Set<string> | null | undefined,
  topicSet: Set<string> | null | undefined
): PostWithMeta[] {
  if (!rootSet || rootSet.size === 0) return posts;
  const topicOk = Boolean(topicSet && topicSet.size > 0);
  const topicMatches: PostWithMeta[] = [];
  const rootMatchesOnly: PostWithMeta[] = [];
  const others: PostWithMeta[] = [];
  for (const p of posts) {
    const cid = p.category_id;
    if (topicOk && topicSet!.has(cid)) {
      topicMatches.push(p);
    } else if (rootSet.has(cid)) {
      rootMatchesOnly.push(p);
    } else {
      others.push(p);
    }
  }
  return topicOk ? [...topicMatches, ...rootMatchesOnly, ...others] : [...rootMatchesOnly, ...others];
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
  queryExtras?: HomePostsQueryExtras
): Promise<{ posts: PostWithMeta[]; hasMore: boolean } | null> {
  const feedConstraint = resolveTradeFeedLocationConstraint(lguCityId, radiusKm);
  if (feedConstraint.kind === "invalid") {
    return { posts: [], hasMore: false };
  }
  const feedLocExtras = tradeFeedLocationSqlExtras(feedConstraint);
  const useDistance = sort === "distance" && feedConstraint.kind === "lgu";
  const rangeFrom = useDistance ? 0 : from;
  const rangeTo = useDistance
    ? MARKETPLACE_DISTANCE_SCAN_CAP - 1
    : from + HOME_POSTS_PAGE_SIZE - 1;
  const mapped = await fetchHomePostsMappedRange(
    sb,
    table,
    sort,
    type,
    tradeCategoryIds,
    statusOr,
    feedLocExtras,
    queryExtras,
    rangeFrom,
    rangeTo
  );
  if (!mapped) return null;
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

export async function loadSearchExpansionRound(
  sb: SupabaseClient<any>,
  table: string,
  sort: HomePostsQuerySort,
  type: HomePostsQueryType,
  tradeCategoryIds: string[] | null,
  statusOr: string,
  lguCityId: string | null | undefined,
  radiusKm: number | null | undefined,
  queryExtras: HomePostsQueryExtras | undefined,
  cursor: SearchExpansionCursor
): Promise<{ posts: PostWithMeta[]; cursor: SearchExpansionCursor; queryCount: number } | null> {
  const searchQ = sanitizeMarketplaceQueryText(queryExtras?.q);
  const hints = resolveSearchExpansionHints(searchQ);
  if (!hints) {
    return { posts: [], cursor: { ...cursor, exactExhausted: true, relatedInExhausted: true, relatedOutExhausted: true }, queryCount: 0 };
  }
  const feedConstraint = resolveTradeFeedLocationConstraint(lguCityId, radiusKm);
  if (feedConstraint.kind === "invalid") {
    return {
      posts: [],
      cursor: { ...cursor, exactExhausted: true, relatedInExhausted: true, relatedOutExhausted: true },
      queryCount: 0,
    };
  }
  const feedLocExtras = tradeFeedLocationSqlExtras(feedConstraint);
  const browseLgu = feedConstraint.kind === "lgu" ? feedConstraint.canonicalId : null;
  const hasHardRadius = feedConstraint.kind === "lgu" && feedConstraint.radiusKm != null;
  const matchingLguIds =
    feedConstraint.kind === "lgu" ? [...new Set(feedConstraint.matchingCanonicalIds)] : [];
  const rootSet =
    queryExtras?.categoryPriorityRootTradeCategoryIds && queryExtras.categoryPriorityRootTradeCategoryIds.length > 0
      ? new Set(queryExtras.categoryPriorityRootTradeCategoryIds)
      : null;
  const topicSet =
    queryExtras?.categoryPriorityTopicTradeCategoryIds && queryExtras.categoryPriorityTopicTradeCategoryIds.length > 0
      ? new Set(queryExtras.categoryPriorityTopicTradeCategoryIds)
      : null;
  let queryCount = 0;
  let exactRows: PostWithMeta[] = [];
  if (!cursor.exactExhausted) {
    const exact = await fetchHomePostsMappedRange(
      sb,
      table,
      sort,
      type,
      tradeCategoryIds,
      statusOr,
      feedLocExtras,
      queryExtras,
      cursor.exactOffset,
      cursor.exactOffset + SEARCH_EXPANSION_EXACT_BATCH - 1,
        { applyTitleQuery: true, applyLocation: hasHardRadius }
    );
    if (!exact) return null;
    queryCount += 1;
    exactRows = partitionPostsByCategoryPriority(exact, rootSet, topicSet);
  }
  const inferredBodyTypes = [
    ...new Set([...cursor.inferredBodyTypes, ...inferBodyTypesFromListings(exactRows)]),
  ];
  const relatedOr = buildSearchExpansionRelatedOrFilter(hints, inferredBodyTypes);
  let relatedInRows: PostWithMeta[] = [];
  let relatedOutRows: PostWithMeta[] = [];
  if (!cursor.relatedInExhausted && relatedOr) {
    const relatedIn = await fetchHomePostsMappedRange(
      sb,
      table,
      sort,
      type,
      tradeCategoryIds,
      statusOr,
      feedLocExtras,
      queryExtras,
      cursor.relatedInOffset,
      cursor.relatedInOffset + SEARCH_EXPANSION_RELATED_IN_BATCH - 1,
      { applyTitleQuery: false, applyLocation: hasHardRadius, relatedOr }
    );
    if (!relatedIn) return null;
    queryCount += 1;
    relatedInRows = partitionPostsByCategoryPriority(relatedIn, rootSet, topicSet);
  }
  const fetchRelatedOut = Boolean(
    browseLgu &&
      feedConstraint.kind === "lgu" &&
      feedConstraint.radiusKm === null &&
      relatedOr &&
      !cursor.relatedOutExhausted
  );
  if (fetchRelatedOut) {
    const relatedOut = await fetchHomePostsMappedRange(
      sb,
      table,
      sort,
      type,
      tradeCategoryIds,
      statusOr,
      feedLocExtras,
      queryExtras,
      cursor.relatedOutOffset,
      cursor.relatedOutOffset + SEARCH_EXPANSION_RELATED_OUT_BATCH - 1,
      {
        applyTitleQuery: false,
        applyLocation: false,
        relatedOr,
        excludeLguIds: matchingLguIds,
      }
    );
    if (!relatedOut) return null;
    queryCount += 1;
    const withinConstraint =
      feedConstraint.kind === "lgu" ? feedConstraint : null;
    relatedOutRows = partitionPostsByCategoryPriority(
      withinConstraint
        ? filterPostsOutsideBrowseAnchor(relatedOut, withinConstraint)
        : relatedOut,
      rootSet,
      topicSet
    );
  }
  const fetched = {
    exact: exactRows.length,
    relatedIn: relatedInRows.length,
    relatedOut: fetchRelatedOut ? relatedOutRows.length : 0,
  };
  const advanced = advanceSearchExpansionCursor(
    {
      ...cursor,
      inferredBodyTypes,
      relatedOutExhausted: cursor.relatedOutExhausted || !browseLgu || !relatedOr,
      relatedInExhausted: cursor.relatedInExhausted || !relatedOr,
    },
    fetched,
    {
      exact: SEARCH_EXPANSION_EXACT_BATCH,
      relatedIn: SEARCH_EXPANSION_RELATED_IN_BATCH,
      relatedOut: SEARCH_EXPANSION_RELATED_OUT_BATCH,
    },
    {
      exact: !cursor.exactExhausted,
      relatedIn: !cursor.relatedInExhausted && Boolean(relatedOr),
      relatedOut: fetchRelatedOut,
    }
  );
  const assembled = assembleSearchExpansionRound({
    exactRows,
    relatedInRows,
    relatedOutRows,
    hints,
    browseLguCanonicalId: browseLgu,
    userSort: sort,
    cursor: advanced,
  });
  return { posts: assembled.posts, cursor: assembled.cursor, queryCount };
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
  queryExtras?: HomePostsQueryExtras
): Promise<{ posts: PostWithMeta[]; hasMore: boolean } | null> {
  const qIsAbsent = queryExtras?.q == null || queryExtras?.q === "";
  const useRegionAllBrowsePriority = shouldUseRegionAllBrowsePriority(
    lguCityId,
    radiusKm,
    qIsAbsent
  );
  const rootIds = queryExtras?.categoryPriorityRootTradeCategoryIds ?? null;
  const topicIds = queryExtras?.categoryPriorityTopicTradeCategoryIds ?? null;
  const hasCategoryPriority = qIsAbsent && rootIds && rootIds.length > 0;

  if (!useRegionAllBrowsePriority) {
    if (hasCategoryPriority) {
      const resolveCategoryPriorityPayloadForSb = async (sb: SupabaseClient<any>) => {
        const feedConstraint = resolveTradeFeedLocationConstraint(lguCityId, radiusKm);
        if (feedConstraint.kind === "invalid") {
          return null;
        }

        const feedLocExtras = tradeFeedLocationSqlExtras(feedConstraint);
        const targetInclusive = from + HOME_POSTS_PAGE_SIZE;
        const rangeFrom = 0;
        const rangeTo = targetInclusive;

        const rootSet = new Set(rootIds!);
        const topicSet = topicIds && topicIds.length > 0 ? new Set(topicIds) : null;

        const mapped = await fetchHomePostsMappedRange(
          sb,
          POSTS_TABLE_READ,
          sort,
          type,
          tradeCategoryIds,
          statusOr,
          feedLocExtras,
          queryExtras,
          rangeFrom,
          rangeTo,
          {
            applyLocation: Boolean(feedLocExtras),
            excludeLguIds: null,
            excludeTradeCategoryIds: null,
          }
        );
        if (!mapped) return null;

        const assembled = partitionPostsByCategoryPriority(mapped, rootSet, topicSet);
        return {
          posts: assembled.slice(from, from + HOME_POSTS_PAGE_SIZE),
          hasMore: assembled.length > targetInclusive,
        };
      };

      const fromMaskedRead = await resolveCategoryPriorityPayloadForSb(readSb);
      if (fromMaskedRead) return fromMaskedRead;

      if (serviceSb && serviceSb !== readSb) {
        const fromMaskedService = await resolveCategoryPriorityPayloadForSb(serviceSb);
        if (fromMaskedService) return fromMaskedService;
      }
    }

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

  async function resolveBrowsePriorityPayloadForSb(sb: SupabaseClient<any>) {
    const feedConstraint = resolveTradeFeedLocationConstraint(lguCityId, radiusKm);
    if (feedConstraint.kind === "invalid") {
      return { posts: [], hasMore: false };
    }
    if (feedConstraint.kind !== "lgu") {
      return loadHomePostsPage(
        sb,
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
    }

    /** region+전체 within: anchor SQL. Outside: nationwide scan + legacy-disjoint filter (not global top-N trim). */
    const anchorLocExtras = tradeFeedLocationToQueryExtras(feedConstraint);
    const targetInclusive = from + HOME_POSTS_PAGE_SIZE;
    const rangeFrom = 0;
    const rangeTo = targetInclusive;

    const rootIds = queryExtras?.categoryPriorityRootTradeCategoryIds ?? null;
    const topicIds = queryExtras?.categoryPriorityTopicTradeCategoryIds ?? null;

    const rootArr = rootIds && rootIds.length > 0 ? rootIds : null;
    const topicArr = topicIds && topicIds.length > 0 ? topicIds : [];

    const canSortByDistance = sort === "distance";
    const canonicalId = feedConstraint.canonicalId;

    const fetchRegionAllOutsidePrefix = async (args: {
      tradeCatIds: string[] | null;
      excludeTradeCatIds?: string[] | null;
    }): Promise<PostWithMeta[]> => {
      const batchSize = HOME_POSTS_PAGE_SIZE;
      const collected: PostWithMeta[] = [];
      const seen = new Set<string>();
      let dbOffset = 0;
      while (collected.length <= targetInclusive && dbOffset < MARKETPLACE_DISTANCE_SCAN_CAP) {
        const batchEnd = Math.min(dbOffset + batchSize - 1, MARKETPLACE_DISTANCE_SCAN_CAP - 1);
        const batch = await fetchHomePostsMappedRange(
          sb,
          POSTS_TABLE_READ,
          sort,
          type,
          args.tradeCatIds,
          statusOr,
          undefined,
          queryExtras,
          dbOffset,
          batchEnd,
          {
            applyLocation: false,
            excludeTradeCategoryIds: args.excludeTradeCatIds ?? null,
          }
        );
        if (!batch || batch.length === 0) break;
        for (const row of filterPostsOutsideBrowseAnchor(batch, feedConstraint)) {
          const id = (row.id ?? "").trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          collected.push(row);
          if (collected.length > targetInclusive) break;
        }
        if (batch.length < batchSize) break;
        dbOffset += batchSize;
      }
      if (canSortByDistance) {
        return sortListingsByLguDistance(collected, canonicalId);
      }
      return collected;
    };

    const fetchTier = async (args: {
      tradeCatIds: string[] | null;
      tier: "within" | "outside";
      excludeTradeCatIds?: string[] | null;
    }): Promise<PostWithMeta[]> => {
      if (args.tier === "outside") {
        return fetchRegionAllOutsidePrefix(args);
      }
      const mapped = await fetchHomePostsMappedRange(
        sb,
        POSTS_TABLE_READ,
        sort,
        type,
        args.tradeCatIds,
        statusOr,
        anchorLocExtras,
        queryExtras,
        rangeFrom,
        rangeTo,
        {
          applyLocation: true,
          excludeTradeCategoryIds: args.excludeTradeCatIds ?? null,
        }
      );
      if (!mapped) return [];
      if (canSortByDistance) {
        return sortListingsByLguDistance(mapped, canonicalId);
      }
      return mapped;
    };

    if (!rootArr) {
      const withinAll = await fetchTier({ tradeCatIds: null, tier: "within" });
      const outsideAll = await fetchTier({ tradeCatIds: null, tier: "outside" });
      const assembled = [...withinAll, ...outsideAll];
      return {
        posts: assembled.slice(from, from + HOME_POSTS_PAGE_SIZE),
        hasMore: assembled.length > targetInclusive,
      };
    }

    // category 선택이 있으면: topic → root-only → others, 그리고 within → outside
    const withinTopicMatch =
      topicArr.length > 0
        ? await fetchTier({ tradeCatIds: topicArr, tier: "within" })
        : [];
    const withinRootOnly = await fetchTier({
      tradeCatIds: rootArr,
      tier: "within",
      excludeTradeCatIds: topicArr.length > 0 ? topicArr : null,
    });
    const withinOthers = await fetchTier({
      tradeCatIds: null,
      tier: "within",
      excludeTradeCatIds: rootArr,
    });

    const outsideTopicMatch =
      topicArr.length > 0
        ? await fetchTier({ tradeCatIds: topicArr, tier: "outside" })
        : [];
    const outsideRootOnly = await fetchTier({
      tradeCatIds: rootArr,
      tier: "outside",
      excludeTradeCatIds: topicArr.length > 0 ? topicArr : null,
    });
    const outsideOthers = await fetchTier({
      tradeCatIds: null,
      tier: "outside",
      excludeTradeCatIds: rootArr,
    });

    const assembled = [
      ...withinTopicMatch,
      ...withinRootOnly,
      ...withinOthers,
      ...outsideTopicMatch,
      ...outsideRootOnly,
      ...outsideOthers,
    ];

    return {
      posts: assembled.slice(from, from + HOME_POSTS_PAGE_SIZE),
      hasMore: assembled.length > targetInclusive,
    };
  }

  const fromMaskedRead = await resolveBrowsePriorityPayloadForSb(readSb);
  if (fromMaskedRead) return fromMaskedRead;

  if (serviceSb && serviceSb !== readSb) {
    const fromMaskedService = await resolveBrowsePriorityPayloadForSb(serviceSb);
    if (fromMaskedService) return fromMaskedService;
  }

  if (serviceSb) {
    return resolveBrowsePriorityPayloadForSb(serviceSb);
  }

  return null;
}

export async function resolveSearchExpansionRound(
  readSb: SupabaseClient<any>,
  serviceSb: SupabaseClient<any> | null,
  sort: HomePostsQuerySort,
  type: HomePostsQueryType,
  tradeCategoryIds: string[] | null,
  statusOr: string,
  lguCityId: string | null | undefined,
  radiusKm: number | null | undefined,
  queryExtras: HomePostsQueryExtras | undefined,
  cursor: SearchExpansionCursor
): Promise<{ posts: PostWithMeta[]; cursor: SearchExpansionCursor; queryCount: number } | null> {
  const fromMaskedRead = await loadSearchExpansionRound(
    readSb,
    POSTS_TABLE_READ,
    sort,
    type,
    tradeCategoryIds,
    statusOr,
    lguCityId,
    radiusKm,
    queryExtras,
    cursor
  );
  if (fromMaskedRead) return fromMaskedRead;
  if (serviceSb && serviceSb !== readSb) {
    const fromMaskedService = await loadSearchExpansionRound(
      serviceSb,
      POSTS_TABLE_READ,
      sort,
      type,
      tradeCategoryIds,
      statusOr,
      lguCityId,
      radiusKm,
      queryExtras,
      cursor
    );
    if (fromMaskedService) return fromMaskedService;
  }
  if (serviceSb) {
    return loadSearchExpansionRound(
      serviceSb,
      "posts",
      sort,
      type,
      tradeCategoryIds,
      statusOr,
      lguCityId,
      radiusKm,
      queryExtras,
      cursor
    );
  }
  return null;
}

/** Re-apply user sort inside SEARCH ranked window (tiers preserved; sort ≠ universe). */
export function applyHomePostsSortToListings(
  posts: PostWithMeta[],
  sort: HomePostsQuerySort,
  anchorCanonicalId: string | null | undefined
): PostWithMeta[] {
  if (sort === "distance" && anchorCanonicalId?.trim()) {
    return sortListingsByLguDistance(posts, anchorCanonicalId.trim());
  }
  if (sort === "popular") {
    return [...posts].sort((a, b) => {
      const av = Number(a.view_count ?? 0);
      const bv = Number(b.view_count ?? 0);
      if (bv !== av) return bv - av;
      const at = Date.parse(String(a.created_at ?? "")) || 0;
      const bt = Date.parse(String(b.created_at ?? "")) || 0;
      return bt - at;
    });
  }
  return posts;
}
