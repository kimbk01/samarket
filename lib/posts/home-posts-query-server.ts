/**
 * `/api/philife/posts` 조회 코어.
 * 거래 `trade_category_id` 필터 문자열은 마켓 피드와 동일 규칙·청크(`trade-posts-category-filter`).
 * 마켓 탭 목록 단일 소스는 `fetchPostsRangeForTradeCategories` / `GET /api/trade/feed` — `docs/trade-market-feed-contract.md`.
 */
import { stripTradeListPrivateFields } from "@/lib/posts/public-post-private-fields";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import { normalizePostImages, normalizePostMeta, normalizePostPrice } from "@/lib/posts/post-normalize";
import { resolveAuthorIdFromPostRow } from "@/lib/posts/resolve-post-author-id";
import { applyPostgrestAndGroup } from "@/lib/posts/apply-postgrest-and-group";
import {
  buildTradePostsStatusAndCategoryAndFilter,
  POSTGREST_TRADE_CATEGORY_IN_CHUNK_SIZE,
} from "@/lib/posts/trade-posts-category-filter";
import { expandTradeCategoryIdsForRoot } from "@/lib/trade/trade-market-catalog";
import {
  POST_TRADE_LIST_SELECT,
  applyResolvedTradeFeedLocationToQuery,
  type TradeFeedQueryExtras,
} from "@/lib/posts/trade-posts-range-query";
import {
  resolveTradeFeedLocationConstraint,
  type TradeFeedLocationConstraint,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { tradeFeedLocationSqlExtras } from "@/lib/trade/location/national/trade-feed-location-sql-extras";
import {
  applyMarketplaceQueryToPostgrest,
  parseMarketplacePriceBound,
  sanitizeMarketplaceQueryText,
} from "@/lib/trade/marketplace/query-contract";
import type { MarketplaceSearchDiscoveryContext } from "@/lib/trade/marketplace/load-marketplace-search-discovery-context";
import { classifyDiscoveryBand } from "@/lib/trade/marketplace/marketplace-discovery-rank";
import { buildSearchCandidateSqlFilter } from "@/lib/trade/marketplace/search-candidate-sql";
import type { SearchTopicGraphContext } from "@/lib/trade/marketplace/search-topic-graph-context";
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
  inferBodyTypesFromListings,
  type SearchExpansionCursor,
} from "@/lib/trade/marketplace/search-candidate-expansion";
import {
  compareBrowseListingsInBlock,
  sortBrowseListingsWithinLocationBlock,
} from "@/lib/trade/marketplace/assemble-marketplace-browse-order";
import {
  buildListSegments,
  classifyListRowSegment,
  type ListRowLike,
  type ListSegment,
  type ListSegmentInput,
  type ListTradeStateChoice,
} from "@/lib/trade/marketplace/list-contract/list-segments";
import {
  rankSearchRowsBySegments,
  searchSectionKey,
} from "@/lib/trade/marketplace/list-contract/rank-search-by-segments";
import {
  resolveListLocationPlan,
  type ListHoodAnchor,
} from "@/lib/trade/marketplace/list-contract/list-location-blocks";

export const HOME_POSTS_PAGE_SIZE = 50;

/** Search ranks the eligible pool once per ranked window up to this many rows (same cap as distance scan). */
export const MARKETPLACE_SEARCH_RANK_POOL_CAP = MARKETPLACE_DISTANCE_SCAN_CAP;
/**
 * Search ranking reads only these columns (band · tier · sort inputs). Full rows are loaded
 * for the visible page only (`hydrateHomePostsByIds`) — skips images/content and the
 * per-row masking function of `posts_masked` for the whole pool (measured 12.7ms → 0.41ms
 * per 117 rows, 876B → 451B per row).
 */
export const MARKETPLACE_SEARCH_RANK_SELECT =
  "id,trade_category_id,title,meta,trade_lgu_id,region,city,created_at,view_count,price,status";

/** One PostgREST request never asks for more than this (Supabase `max-rows` default is 1000). */
const POSTGREST_LIST_CHUNK_ROWS = 500;

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
/** 판매완료 — 목록 계약 ④ 「다른 상태」 구간 */
export const HOME_POSTS_SOLD_STATUS_OR = "status.eq.sold";
/** 공개 거래 상태 전체(숨김 제외) — 검색 후보 풀 */
export const HOME_POSTS_PUBLIC_ANY_STATUS_OR = "status.is.null,status.neq.hidden";
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

export function mapPostRowForHome(rawRow: Record<string, unknown>): PostWithMeta {
  const row = stripTradeListPrivateFields(rawRow);
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
  /** CUT-SSOT-2 TOPIC graph for search relevance */
  searchTopicGraphContext?: SearchTopicGraphContext | null;
  /** SEARCH-LOCATION-FRESH-1 intent + ROOT expanded ids (ranking only) */
  searchDiscoveryContext?: MarketplaceSearchDiscoveryContext | null;
  /** 목록 계약 ④ — 고른 거래 상태(전체 = 판매중 → 판매완료) */
  listTradeState?: ListTradeStateChoice;
  /** 목록 계약 §2 — 로그인 회원 대표 주소 동네(서버가 읽음) */
  listHood?: ListHoodAnchor | null;
};

type HomePostsRangeFilterOpts = {
  /** Override the column list (single attempt, no select-tier fallback). */
  selectFields?: string;
  applyTitleQuery?: boolean;
  applyLocation?: boolean;
  relatedOr?: string | null;
  /** Extra `.or()` groups, each ANDed (e.g. NULL-safe complement of the search candidate filter). */
  extraOrGroups?: string[] | null;
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
    for (const group of filterOpts?.extraOrGroups ?? []) {
      q = q.or(group);
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

  const selectTiers: readonly string[] = filterOpts?.selectFields
    ? [filterOpts.selectFields]
    : HOME_POSTS_SELECT_TIERS;
  outer: for (const selectFields of selectTiers) {
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
  }

  if (!data) return null;
  return data.map((row) =>
    mapPostRowForHome(row && typeof row === "object" ? (row as Record<string, unknown>) : {})
  );
}

/**
 * `fetchHomePostsMappedRange` for [rangeFrom, rangeTo] in ≤ POSTGREST_LIST_CHUNK_ROWS requests,
 * so PostgREST `max-rows` can never silently truncate a long range. `exhausted` = source ended.
 */
async function fetchHomePostsMappedRangeChunked(
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
): Promise<{ rows: PostWithMeta[]; exhausted: boolean } | null> {
  const rows: PostWithMeta[] = [];
  let offset = rangeFrom;
  while (offset <= rangeTo) {
    const end = Math.min(offset + POSTGREST_LIST_CHUNK_ROWS - 1, rangeTo);
    const chunk = await fetchHomePostsMappedRange(
      sb,
      table,
      sort,
      type,
      tradeCategoryIds,
      statusOr,
      feedLocExtras,
      queryExtras,
      offset,
      end,
      filterOpts
    );
    if (!chunk) return null;
    rows.push(...chunk);
    if (chunk.length < end - offset + 1) return { rows, exhausted: true };
    offset = end + 1;
  }
  return { rows, exhausted: false };
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
  const fetched = await fetchHomePostsMappedRangeChunked(
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
  if (!fetched) return null;
  const mapped = fetched.rows;
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
  const discovery = queryExtras?.searchDiscoveryContext;
  const searchQ = sanitizeMarketplaceQueryText(queryExtras?.q);
  if (!searchQ || !discovery) {
    return {
      posts: [],
      cursor: {
        ...cursor,
        exactExhausted: true,
        relatedInExhausted: true,
        relatedOutExhausted: true,
        tailExhausted: true,
      },
      queryCount: 0,
    };
  }

  const feedConstraint = resolveTradeFeedLocationConstraint(lguCityId, radiusKm);
  if (feedConstraint.kind === "invalid") {
    return {
      posts: [],
      cursor: {
        ...cursor,
        exactExhausted: true,
        relatedInExhausted: true,
        relatedOutExhausted: true,
        tailExhausted: true,
      },
      queryCount: 0,
    };
  }

  if (cursor.tailExhausted) {
    return {
      posts: [],
      cursor: {
        ...cursor,
        exactExhausted: true,
        relatedInExhausted: true,
        relatedOutExhausted: true,
        tailExhausted: true,
      },
      queryCount: 0,
    };
  }

  /**
   * 거래 목록 계약 ① (Owner 2026-10-27): 검색어 단계(일치 0–4 → 나머지 5)가 바깥, 그 안에 목록과 같은 구간
   * (물품 → 옵션 → 가격 → 상태 → 지역), 구간 안 정렬. 나머지(5)까지 전체가 나온다(T5-B 폐기).
   * 후보 풀은 공개 거래 전체(숨김 제외 · 모든 상태 · 가격/옵션/카테고리/지역으로 거르지 않음).
   */
  const segInput = buildListSegmentInputFromExtras(tradeCategoryIds, queryExtras, feedConstraint);
  const segments = buildListSegments(segInput);
  const poolExtras: HomePostsQueryExtras = {
    ...queryExtras,
    priceMin: undefined,
    priceMax: undefined,
    compositionFilters: undefined,
  };
  void statusOr;
  const ctx: SearchRoundContext = {
    sb,
    table,
    sort,
    type,
    tradeCategoryIds,
    queryExtras,
    poolExtras,
    discovery,
    segInput,
    segments,
    anchorCanonicalId: segInput.location.anchorCanonicalId,
  };

  if (cursor.searchMode === "candidate") return loadSearchCandidateTailRound(ctx, cursor);
  if (cursor.searchMode !== "fullpool") {
    const candidate = await loadSearchCandidateFirstRound(ctx, cursor);
    if (candidate !== "fallback") return candidate;
  }
  return loadSearchFullPoolRound(ctx, cursor);
}

type SearchRoundContext = {
  sb: SupabaseClient<any>;
  table: string;
  sort: HomePostsQuerySort;
  type: HomePostsQueryType;
  /** 전체 대상(HOME 거래 합집합 또는 null) */
  tradeCategoryIds: string[] | null;
  queryExtras: HomePostsQueryExtras | undefined;
  /** 후보 풀용 — 가격·옵션 조건을 뺀 것(순서만 정하므로 풀은 전체) */
  poolExtras: HomePostsQueryExtras;
  discovery: MarketplaceSearchDiscoveryContext;
  segInput: ListSegmentInput;
  segments: ListSegment[];
  anchorCanonicalId: string | null;
};

type SearchRoundResult = { posts: PostWithMeta[]; cursor: SearchExpansionCursor; queryCount: number };

/** Rows emitted per tail round (several PostgREST chunks may be merged into one round). */
const SEARCH_TAIL_ROUND_ROWS = POSTGREST_LIST_CHUNK_ROWS;

function searchBandOf(ctx: SearchRoundContext, cursor: SearchExpansionCursor) {
  return (row: PostWithMeta) =>
    classifyDiscoveryBand(
      row,
      ctx.discovery.intent,
      ctx.discovery.rootExpandedIdsByParent,
      ctx.discovery.topicGraph,
      cursor.inferredBodyTypes
    );
}

function searchSegmentOf(ctx: SearchRoundContext) {
  return (row: PostWithMeta) =>
    classifyListRowSegment(row as unknown as ListRowLike, ctx.segInput, ctx.segments);
}

function dedupeAgainstSeen(rows: PostWithMeta[], seen: Set<string>): PostWithMeta[] {
  const out: PostWithMeta[] = [];
  for (const row of rows) {
    const id = (row.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

/**
 * Round 1 (candidate mode): rank only rows matching the SQL candidate filter (superset of
 * bands 0–4) — 단계 → 구간 → 정렬. 단계 5 후보는 구간별 SQL 나머지와 합쳐 뒤 라운드에서 낸다.
 * "fallback" = filter not expressible or candidate set above the cap → full-pool path.
 */
async function loadSearchCandidateFirstRound(
  ctx: SearchRoundContext,
  cursor: SearchExpansionCursor
): Promise<SearchRoundResult | null | "fallback"> {
  const filter = buildSearchCandidateSqlFilter(ctx.discovery, cursor.inferredBodyTypes);
  if (!filter) return "fallback";
  const fetched = await fetchHomePostsMappedRangeChunked(
    ctx.sb,
    ctx.table,
    ctx.sort,
    ctx.type,
    ctx.tradeCategoryIds,
    HOME_POSTS_PUBLIC_ANY_STATUS_OR,
    undefined,
    ctx.poolExtras,
    0,
    MARKETPLACE_SEARCH_RANK_POOL_CAP - 1,
    {
      applyTitleQuery: false,
      applyLocation: false,
      selectFields: MARKETPLACE_SEARCH_RANK_SELECT,
      relatedOr: filter.orBody,
    }
  );
  /**
   * Failure here (e.g. `search_text` not migrated yet) → previous full-pool path, which
   * reports a real DB outage as an error itself. Overflow above the cap → same fallback.
   */
  if (!fetched || !fetched.exhausted) return "fallback";

  const { ranked, rest } = rankSearchRowsBySegments({
    rows: fetched.rows,
    segments: ctx.segments,
    bandOf: searchBandOf(ctx, cursor),
    segmentOf: searchSegmentOf(ctx),
    sort: ctx.sort,
    anchorCanonicalId: ctx.anchorCanonicalId,
    holdRest: true,
  });

  const seen = new Set(cursor.seenIds);
  const posts = dedupeAgainstSeen(ranked, seen);
  return {
    posts,
    cursor: {
      ...cursor,
      searchMode: "candidate",
      candidateTail: {
        negations: filter.negations,
        pending: rest.map((r) => ({ block: r.segment, row: r.row })),
        blockIdx: 0,
        blockOffset: 0,
      },
      exactExhausted: true,
      relatedInExhausted: true,
      relatedOutExhausted: true,
      tailExhausted: false,
      seenIds: [...seen],
    },
    queryCount: Math.max(1, Math.ceil(fetched.rows.length / POSTGREST_LIST_CHUNK_ROWS)),
  };
}

function mergeSortedRows(
  a: PostWithMeta[],
  b: PostWithMeta[],
  sort: "latest" | "popular"
): PostWithMeta[] {
  const out: PostWithMeta[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (compareBrowseListingsInBlock(a[i], b[j], sort) <= 0) out.push(a[i++]);
    else out.push(b[j++]);
  }
  while (i < a.length) out.push(a[i++]);
  while (j < b.length) out.push(b[j++]);
  return out;
}

/**
 * Tail rounds (candidate mode): 단계 5(나머지) = (단계 5 후보) ∪ (후보 조건에 안 맞는 행), **구간마다** 순서대로.
 * 후보 조건 밖 행은 구간 SQL 로 그 순서대로 읽고, 후보는 비교 함수로 끼워 넣는다.
 */
async function loadSearchCandidateTailRound(
  ctx: SearchRoundContext,
  cursor: SearchExpansionCursor
): Promise<SearchRoundResult | null> {
  const state = cursor.candidateTail;
  if (!state) {
    return { posts: [], cursor: { ...cursor, tailExhausted: true }, queryCount: 0 };
  }
  const fullBlockSort = ctx.sort === "distance" && ctx.anchorCanonicalId != null;
  const mergeSort: "latest" | "popular" = ctx.sort === "popular" ? "popular" : "latest";
  let pending = state.pending;
  let blockIdx = state.blockIdx;
  let blockOffset = state.blockOffset;
  const out: PostWithMeta[] = [];
  let queryCount = 0;
  const tag = (rows: PostWithMeta[], seg: ListSegment) =>
    rows.map((row) => ({ ...row, list_section: searchSectionKey(5, seg) }));

  while (out.length < SEARCH_TAIL_ROUND_ROWS && blockIdx < ctx.segments.length) {
    const seg = ctx.segments[blockIdx]!;
    const here = pending.filter((p) => p.block === blockIdx).map((p) => p.row as PostWithMeta);
    const rest = () => pending.filter((p) => p.block !== blockIdx);
    if (fullBlockSort) {
      const all = await fetchListSegmentRows(
        ctx.sb,
        ctx.table,
        ctx.sort,
        ctx.type,
        seg,
        ctx.queryExtras,
        0,
        MARKETPLACE_SEARCH_RANK_POOL_CAP - 1,
        { applyTitleQuery: false, selectFields: MARKETPLACE_SEARCH_RANK_SELECT },
        state.negations
      );
      if (!all) return null;
      queryCount += Math.max(1, Math.ceil(all.rows.length / POSTGREST_LIST_CHUNK_ROWS));
      out.push(
        ...tag(sortBrowseListingsWithinLocationBlock([...here, ...all.rows], "distance", ctx.anchorCanonicalId), seg)
      );
      pending = rest();
      blockIdx += 1;
      blockOffset = 0;
      continue;
    }
    const chunkFetch = await fetchListSegmentRows(
      ctx.sb,
      ctx.table,
      ctx.sort,
      ctx.type,
      seg,
      ctx.queryExtras,
      blockOffset,
      blockOffset + POSTGREST_LIST_CHUNK_ROWS - 1,
      { applyTitleQuery: false, selectFields: MARKETPLACE_SEARCH_RANK_SELECT },
      state.negations
    );
    if (!chunkFetch) return null;
    const chunk = chunkFetch.rows;
    queryCount += 1;
    if (chunk.length < POSTGREST_LIST_CHUNK_ROWS) {
      out.push(...tag(mergeSortedRows(here, chunk, mergeSort), seg));
      pending = rest();
      blockIdx += 1;
      blockOffset = 0;
      continue;
    }
    /** Only candidates that sort before the last streamed row are final for this round. */
    const last = chunk[chunk.length - 1];
    const take = here.filter((row) => compareBrowseListingsInBlock(row, last, mergeSort) < 0);
    const takeIds = new Set(take.map((r) => r.id));
    out.push(...tag(mergeSortedRows(take, chunk, mergeSort), seg));
    pending = pending.filter((p) => !(p.block === blockIdx && takeIds.has((p.row as PostWithMeta).id)));
    blockOffset += chunk.length;
  }

  const seen = new Set(cursor.seenIds);
  const posts = dedupeAgainstSeen(out, seen);
  const done = blockIdx >= ctx.segments.length;
  return {
    posts,
    cursor: {
      ...cursor,
      candidateTail: { ...state, pending, blockIdx, blockOffset },
      tailExhausted: done,
      seenIds: [...seen],
    },
    queryCount,
  };
}

/** Previous path (fallback): rank the whole eligible pool up to the cap — 단계 → 구간 → 정렬. */
async function loadSearchFullPoolRound(
  ctx: SearchRoundContext,
  cursor: SearchExpansionCursor
): Promise<SearchRoundResult | null> {
  const poolFetch = await fetchHomePostsMappedRangeChunked(
    ctx.sb,
    ctx.table,
    ctx.sort,
    ctx.type,
    ctx.tradeCategoryIds,
    HOME_POSTS_PUBLIC_ANY_STATUS_OR,
    undefined,
    ctx.poolExtras,
    cursor.tailOffset,
    cursor.tailOffset + MARKETPLACE_SEARCH_RANK_POOL_CAP - 1,
    { applyTitleQuery: false, applyLocation: false, selectFields: MARKETPLACE_SEARCH_RANK_SELECT }
  );
  if (!poolFetch) return null;
  const pool = poolFetch.rows;
  const poolOffset = cursor.tailOffset + pool.length;
  const tailExhausted = poolFetch.exhausted;

  const { ranked } = rankSearchRowsBySegments({
    rows: pool,
    segments: ctx.segments,
    bandOf: searchBandOf(ctx, cursor),
    segmentOf: searchSegmentOf(ctx),
    sort: ctx.sort,
    anchorCanonicalId: ctx.anchorCanonicalId,
  });
  const seen = new Set(cursor.seenIds);
  const posts = dedupeAgainstSeen(ranked, seen);

  const nextCursor: SearchExpansionCursor = {
    ...cursor,
    searchMode: "fullpool",
    exactExhausted: true,
    relatedInExhausted: true,
    relatedOutExhausted: true,
    tailOffset: poolOffset,
    tailExhausted,
    seenIds: [...seen],
    inferredBodyTypes: [
      ...new Set([...cursor.inferredBodyTypes, ...inferBodyTypesFromListings(posts)]),
    ],
  };

  return { posts, cursor: nextCursor, queryCount: 1 };
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
  queryExtras?: HomePostsQueryExtras,
  pageSize: number = HOME_POSTS_PAGE_SIZE
): Promise<{ posts: PostWithMeta[]; hasMore: boolean } | null> {
  const qIsAbsent = queryExtras?.q == null || queryExtras?.q === "";

  /** 검색어가 있는 비순위 경로(`/api/trade/feed` q 등)·거래가 아닌 글 종류 — 기존 페이지 */
  if (!qIsAbsent || (type != null && type !== "trade")) {
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

  /**
   * 거래 목록 계약(`docs/dibay-marketplace-list-ssot-target.md`, Owner 2026-10-27):
   * 어떤 조건도 글을 숨기지 않는다 — 물품 → 품목 옵션 → 가격 → 거래 상태 → 지역 구간 순서, 구간 안 사용자 정렬.
   * 구간은 겹치지 않는 SQL 조건이고 합은 전체(누락 0 · 중복 0). 각 글에 안내 줄 키 `list_section`.
   */
  const feedConstraint = resolveTradeFeedLocationConstraint(lguCityId, radiusKm);
  if (feedConstraint.kind === "invalid") return { posts: [], hasMore: false };
  const segmentInput = buildListSegmentInputFromExtras(tradeCategoryIds, queryExtras, feedConstraint);
  const segments = buildListSegments(segmentInput);
  const anchorCanonicalId = segmentInput.location.anchorCanonicalId;

  async function resolveSegmentsForSb(
    sb: SupabaseClient<any>
  ): Promise<{ posts: PostWithMeta[]; hasMore: boolean } | null> {
    const targetInclusive = from + pageSize;
    /** distance: 구간마다 상한까지 읽어 시 중심점 거리로 정렬. latest/popular: SQL 순서 그대로. */
    const rangeTo = sort === "distance" ? MARKETPLACE_DISTANCE_SCAN_CAP - 1 : targetInclusive;
    const assembled: PostWithMeta[] = [];
    let scanCapHit = false;
    for (const seg of segments) {
      if (assembled.length > targetInclusive) break;
      const fetched = await fetchListSegmentRows(sb, POSTS_TABLE_READ, sort, type, seg, queryExtras, 0, rangeTo);
      if (!fetched) return null;
      if (!fetched.exhausted) scanCapHit = true;
      const ordered = sortBrowseListingsWithinLocationBlock(fetched.rows, sort, anchorCanonicalId);
      for (const row of ordered) assembled.push(withListSection(row, seg.section));
    }
    return {
      posts: assembled.slice(from, from + pageSize),
      hasMore: assembled.length > targetInclusive || scanCapHit,
    };
  }

  const fromMaskedRead = await resolveSegmentsForSb(readSb);
  if (fromMaskedRead) return fromMaskedRead;
  if (serviceSb && serviceSb !== readSb) {
    const fromMaskedService = await resolveSegmentsForSb(serviceSb);
    if (fromMaskedService) return fromMaskedService;
  }
  if (serviceSb) return resolveSegmentsForSb(serviceSb);
  return null;
}

/** 목록 계약 입력 — 라우트가 넘긴 대상·우선 카테고리·옵션·가격·상태·지역(+내 동네) */
export function buildListSegmentInputFromExtras(
  universeTradeCategoryIds: string[] | null,
  queryExtras: HomePostsQueryExtras | undefined,
  feedConstraint: TradeFeedLocationConstraint
): ListSegmentInput {
  return {
    universeTradeCategoryIds,
    rootTradeCategoryIds: queryExtras?.categoryPriorityRootTradeCategoryIds ?? null,
    topicTradeCategoryIds: queryExtras?.categoryPriorityTopicTradeCategoryIds ?? null,
    compositionFilters: queryExtras?.compositionFilters,
    priceMin: parseMarketplacePriceBound(queryExtras?.priceMin),
    priceMax: parseMarketplacePriceBound(queryExtras?.priceMax),
    tradeState: queryExtras?.listTradeState ?? "all",
    activeStatusOr: HOME_POSTS_STATUS_OR,
    soldStatusOr: HOME_POSTS_SOLD_STATUS_OR,
    location: resolveListLocationPlan(feedConstraint, queryExtras?.listHood ?? null),
  };
}

function withListSection(row: PostWithMeta, section: string): PostWithMeta {
  return { ...row, list_section: section };
}

/** 한 구간의 행 — 구간 조건(카테고리·옵션·가격·상태·지역)만 적용, 판매 의도 자격은 유지 */
async function fetchListSegmentRows(
  sb: SupabaseClient<any>,
  table: string,
  sort: HomePostsQuerySort,
  type: HomePostsQueryType,
  seg: ListSegment,
  queryExtras: HomePostsQueryExtras | undefined,
  rangeFrom: number,
  rangeTo: number,
  extraOpts?: Pick<HomePostsRangeFilterOpts, "selectFields" | "applyTitleQuery">,
  extraOrGroups: string[] = []
): Promise<{ rows: PostWithMeta[]; exhausted: boolean } | null> {
  const segExtras: HomePostsQueryExtras = {
    ...queryExtras,
    priceMin: seg.priceMin,
    priceMax: seg.priceMax,
    compositionFilters: seg.compositionFilters,
  };
  return fetchHomePostsMappedRangeChunked(
    sb,
    table,
    sort,
    type,
    seg.tradeCatIds,
    seg.statusOr,
    seg.loc,
    segExtras,
    rangeFrom,
    rangeTo,
    {
      ...extraOpts,
      applyLocation: seg.applyLocation,
      excludeTradeCategoryIds: seg.excludeTradeCatIds,
      extraOrGroups: [...seg.extraOrGroups, ...extraOrGroups],
    }
  );
}

const HYDRATE_IDS_CHUNK = 100;

async function hydrateHomePostsByIdsForSb(
  sb: SupabaseClient<any>,
  ids: string[]
): Promise<PostWithMeta[] | null> {
  const byId = new Map<string, PostWithMeta>();
  for (let i = 0; i < ids.length; i += HYDRATE_IDS_CHUNK) {
    const chunk = ids.slice(i, i + HYDRATE_IDS_CHUNK);
    let data: unknown[] | null = null;
    for (const selectFields of HOME_POSTS_SELECT_TIERS) {
      const res = await sb.from(POSTS_TABLE_READ).select(selectFields).in("id", chunk);
      if (!res.error && Array.isArray(res.data)) {
        data = res.data;
        break;
      }
    }
    if (!data) return null;
    for (const row of data) {
      const mapped = mapPostRowForHome(
        row && typeof row === "object" ? (row as Record<string, unknown>) : {}
      );
      if (mapped.id) byId.set(String(mapped.id), mapped);
    }
  }
  /** Keep ranked order; a row deleted since ranking is simply absent. */
  return ids.map((id) => byId.get(id)).filter((p): p is PostWithMeta => Boolean(p));
}

/**
 * Search page hydration — full list rows for the ranked ids of ONE page, in ranked order.
 * Null = DB failure on every client (caller answers with an error, never an empty page).
 */
export async function hydrateHomePostsByIds(
  readSb: SupabaseClient<any>,
  serviceSb: SupabaseClient<any> | null,
  ids: string[]
): Promise<PostWithMeta[] | null> {
  const clean = [...new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (clean.length === 0) return [];
  const fromRead = await hydrateHomePostsByIdsForSb(readSb, clean);
  if (fromRead) return fromRead;
  if (serviceSb && serviceSb !== readSb) return hydrateHomePostsByIdsForSb(serviceSb, clean);
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
