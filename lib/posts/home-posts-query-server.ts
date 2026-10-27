/**
 * `/api/philife/posts` 조회 코어.
 * 거래 `trade_category_id` 필터 문자열은 마켓 피드와 동일 규칙·청크(`trade-posts-category-filter`).
 * 마켓 탭 목록 단일 소스는 `fetchPostsRangeForTradeCategories` / `GET /api/trade/feed` — `docs/trade-market-feed-contract.md`.
 */
import { shouldAllowSearchExpansionTail } from "@/lib/trade/marketplace/resolve-marketplace-membership";
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
import {
  shouldUseRegionAllBrowsePriority,
  tradeFeedLocationSqlExtras,
} from "@/lib/trade/location/national/trade-feed-location-sql-extras";
import { applyMarketplaceQueryToPostgrest, sanitizeMarketplaceQueryText } from "@/lib/trade/marketplace/query-contract";
import type { MarketplaceSearchDiscoveryContext } from "@/lib/trade/marketplace/load-marketplace-search-discovery-context";
import {
  classifyDiscoveryBand,
  rankMarketplaceDiscoveryBatch,
} from "@/lib/trade/marketplace/marketplace-discovery-rank";
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
  type SearchCandidateTailState,
  type SearchExpansionCursor,
} from "@/lib/trade/marketplace/search-candidate-expansion";
import {
  compareBrowseListingsInBlock,
  sortBrowseListingsWithinLocationBlock,
} from "@/lib/trade/marketplace/assemble-marketplace-browse-order";
import {
  BROWSE_LOCATION_TIER_ORDER,
  classifyListingBrowseTier,
  resolveBrowseLocationTiers,
  tierLocationQueryExtras,
} from "@/lib/trade/location/national/browse-location-tiers";
import { tradeFeedLocationToQueryExtras } from "@/lib/trade/location/national/trade-feed-location-query-extras";

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
  "id,trade_category_id,title,meta,trade_lgu_id,region,city,created_at,view_count";

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

  const feedLocExtras = tradeFeedLocationSqlExtras(feedConstraint);
  const ctx: SearchRoundContext = {
    sb,
    table,
    sort,
    type,
    tradeCategoryIds,
    statusOr,
    queryExtras,
    feedConstraint,
    feedLocExtras,
    discovery,
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
  tradeCategoryIds: string[] | null;
  statusOr: string;
  queryExtras: HomePostsQueryExtras | undefined;
  feedConstraint: Exclude<TradeFeedLocationConstraint, { kind: "invalid" }>;
  feedLocExtras: TradeFeedQueryExtras["tradeFeedLocation"];
  discovery: MarketplaceSearchDiscoveryContext;
};

type SearchRoundResult = { posts: PostWithMeta[]; cursor: SearchExpansionCursor; queryCount: number };

/** Rows emitted per tail round (several PostgREST chunks may be merged into one round). */
const SEARCH_TAIL_ROUND_ROWS = POSTGREST_LIST_CHUNK_ROWS;

/**
 * Location blocks of the band-5 tail, in final order — same partition the ranker uses:
 * soft anchor → LOCAL / NEARBY / NATIONWIDE; explicit radius → inside only; ALL → one block.
 */
function resolveSearchTailBlocks(constraint: SearchRoundContext["feedConstraint"]): {
  blocks: Array<TradeFeedQueryExtras["tradeFeedLocation"] | null>;
  anchorCanonicalId: string | null;
  blockOf: (row: PostWithMeta) => number;
} {
  if (constraint.kind !== "lgu") {
    return { blocks: [undefined], anchorCanonicalId: null, blockOf: () => 0 };
  }
  const tiers = resolveBrowseLocationTiers(constraint);
  if (!tiers) {
    return {
      blocks: [tradeFeedLocationToQueryExtras(constraint)],
      anchorCanonicalId: constraint.canonicalId,
      blockOf: () => 0,
    };
  }
  return {
    blocks: BROWSE_LOCATION_TIER_ORDER.map((tier) => tierLocationQueryExtras(tiers, tier)),
    anchorCanonicalId: tiers.anchorCanonicalId,
    blockOf: (row) => BROWSE_LOCATION_TIER_ORDER.indexOf(classifyListingBrowseTier(row, tiers)),
  };
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
 * bands 0–4). Emits bands 0–4; band-5 candidates wait to be merged into the lazy tail.
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
    ctx.statusOr,
    ctx.feedLocExtras,
    ctx.queryExtras,
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

  const ranked = rankMarketplaceDiscoveryBatch({
    rows: fetched.rows,
    intent: ctx.discovery.intent,
    rootExpandedIdsByParent: ctx.discovery.rootExpandedIdsByParent,
    topicGraph: ctx.discovery.topicGraph,
    feedConstraint: ctx.feedConstraint,
    userSort: ctx.sort,
    inferredBodyTypes: cursor.inferredBodyTypes,
  });
  const { blockOf } = resolveSearchTailBlocks(ctx.feedConstraint);
  const matched: PostWithMeta[] = [];
  const pending: SearchCandidateTailState["pending"] = [];
  for (const row of ranked) {
    const band = classifyDiscoveryBand(
      row,
      ctx.discovery.intent,
      ctx.discovery.rootExpandedIdsByParent,
      ctx.discovery.topicGraph,
      cursor.inferredBodyTypes
    );
    if (band < 5) matched.push(row);
    else pending.push({ block: blockOf(row), row });
  }

  const seen = new Set(cursor.seenIds);
  const posts = dedupeAgainstSeen(matched, seen);
  /** T5-B: 카테고리(ROOT/TOPIC) 범위가 없으면 무관 tail(band 5)을 붙이지 않는다 — 다른 ROOT 무관 매물 금지 (TM-24) */
  const allowTail = shouldAllowSearchExpansionTail(ctx.tradeCategoryIds);
  return {
    posts,
    cursor: {
      ...cursor,
      searchMode: "candidate",
      candidateTail: allowTail
        ? { negations: filter.negations, pending, blockIdx: 0, blockOffset: 0 }
        : undefined,
      exactExhausted: true,
      relatedInExhausted: true,
      relatedOutExhausted: true,
      tailExhausted: !allowTail,
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
 * Tail rounds (candidate mode): band 5 = (band-5 candidates) ∪ (rows NOT matching the
 * candidate filter), per location block, in the same order the ranker would give.
 * NOT-filter rows stream from SQL in that order; candidates are merged in by comparator.
 */
async function loadSearchCandidateTailRound(
  ctx: SearchRoundContext,
  cursor: SearchExpansionCursor
): Promise<SearchRoundResult | null> {
  const state = cursor.candidateTail;
  const { blocks, anchorCanonicalId } = resolveSearchTailBlocks(ctx.feedConstraint);
  if (!state) {
    return { posts: [], cursor: { ...cursor, tailExhausted: true }, queryCount: 0 };
  }
  const fullBlockSort = ctx.sort === "distance" && anchorCanonicalId != null;
  const mergeSort: "latest" | "popular" = ctx.sort === "popular" ? "popular" : "latest";
  let pending = state.pending;
  let blockIdx = state.blockIdx;
  let blockOffset = state.blockOffset;
  const out: PostWithMeta[] = [];
  let queryCount = 0;

  while (out.length < SEARCH_TAIL_ROUND_ROWS && blockIdx < blocks.length) {
    const loc = blocks[blockIdx];
    const here = pending.filter((p) => p.block === blockIdx).map((p) => p.row as PostWithMeta);
    const rest = () => pending.filter((p) => p.block !== blockIdx);
    if (loc === null) {
      /** Empty tier (e.g. no nearby LGU) — nothing can live here. */
      out.push(...here);
      pending = rest();
      blockIdx += 1;
      blockOffset = 0;
      continue;
    }
    const opts: HomePostsRangeFilterOpts = {
      applyTitleQuery: false,
      applyLocation: true,
      selectFields: MARKETPLACE_SEARCH_RANK_SELECT,
      extraOrGroups: state.negations,
    };
    if (fullBlockSort) {
      const all = await fetchHomePostsMappedRangeChunked(
        ctx.sb,
        ctx.table,
        ctx.sort,
        ctx.type,
        ctx.tradeCategoryIds,
        ctx.statusOr,
        loc,
        ctx.queryExtras,
        0,
        MARKETPLACE_SEARCH_RANK_POOL_CAP - 1,
        opts
      );
      if (!all) return null;
      queryCount += Math.max(1, Math.ceil(all.rows.length / POSTGREST_LIST_CHUNK_ROWS));
      out.push(...sortBrowseListingsWithinLocationBlock([...here, ...all.rows], "distance", anchorCanonicalId));
      pending = rest();
      blockIdx += 1;
      blockOffset = 0;
      continue;
    }
    const chunk = await fetchHomePostsMappedRange(
      ctx.sb,
      ctx.table,
      ctx.sort,
      ctx.type,
      ctx.tradeCategoryIds,
      ctx.statusOr,
      loc,
      ctx.queryExtras,
      blockOffset,
      blockOffset + POSTGREST_LIST_CHUNK_ROWS - 1,
      opts
    );
    if (!chunk) return null;
    queryCount += 1;
    if (chunk.length < POSTGREST_LIST_CHUNK_ROWS) {
      out.push(...mergeSortedRows(here, chunk, mergeSort));
      pending = rest();
      blockIdx += 1;
      blockOffset = 0;
      continue;
    }
    /** Only candidates that sort before the last streamed row are final for this round. */
    const last = chunk[chunk.length - 1];
    const take = here.filter((row) => compareBrowseListingsInBlock(row, last, mergeSort) < 0);
    const takeIds = new Set(take.map((r) => r.id));
    out.push(...mergeSortedRows(take, chunk, mergeSort));
    pending = pending.filter((p) => !(p.block === blockIdx && takeIds.has((p.row as PostWithMeta).id)));
    blockOffset += chunk.length;
  }

  const seen = new Set(cursor.seenIds);
  const posts = dedupeAgainstSeen(out, seen);
  const done = blockIdx >= blocks.length;
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

/** Previous path (fallback): rank the whole eligible pool up to the cap. */
async function loadSearchFullPoolRound(
  ctx: SearchRoundContext,
  cursor: SearchExpansionCursor
): Promise<SearchRoundResult | null> {
  /**
   * Rank the whole eligible pool in one round (up to MARKETPLACE_SEARCH_RANK_POOL_CAP) so
   * band → LOCAL → NEARBY → NATIONWIDE order is global across pages, not per DB batch.
   * Pages are slices of this single ranking (ranked window) — duplicate 0 / missing 0.
   */
  const poolFetch = await fetchHomePostsMappedRangeChunked(
    ctx.sb,
    ctx.table,
    ctx.sort,
    ctx.type,
    ctx.tradeCategoryIds,
    ctx.statusOr,
    ctx.feedLocExtras,
    ctx.queryExtras,
    cursor.tailOffset,
    cursor.tailOffset + MARKETPLACE_SEARCH_RANK_POOL_CAP - 1,
    { applyTitleQuery: false, applyLocation: false, selectFields: MARKETPLACE_SEARCH_RANK_SELECT }
  );
  if (!poolFetch) return null;
  const pool = poolFetch.rows;
  const poolOffset = cursor.tailOffset + pool.length;
  const tailExhausted = poolFetch.exhausted;

  const ranked = rankMarketplaceDiscoveryBatch({
    rows: pool,
    intent: ctx.discovery.intent,
    rootExpandedIdsByParent: ctx.discovery.rootExpandedIdsByParent,
    topicGraph: ctx.discovery.topicGraph,
    feedConstraint: ctx.feedConstraint,
    userSort: ctx.sort,
    inferredBodyTypes: cursor.inferredBodyTypes,
  });

  /** T5-B: 카테고리 범위가 없으면 무관(band 5) 행은 출력하지 않는다 (TM-24) */
  const eligibleRanked = shouldAllowSearchExpansionTail(ctx.tradeCategoryIds)
    ? ranked
    : ranked.filter(
        (row) =>
          classifyDiscoveryBand(
            row,
            ctx.discovery.intent,
            ctx.discovery.rootExpandedIdsByParent,
            ctx.discovery.topicGraph,
            cursor.inferredBodyTypes
          ) < 5
      );
  const seen = new Set(cursor.seenIds);
  const posts = dedupeAgainstSeen(eligibleRanked, seen);

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

export type LSoftBrowseAssemblyMode = "mhard_location" | "nationwide" | "legacy_priority";

/**
 * CUT-SSOT-H — L-SOFT city browse assembly mode.
 * M-HARD membership → location-only tiers (no cross-ROOT others bucket).
 */
export function resolveLSoftBrowseAssemblyMode(
  tradeCategoryIds: string[] | null | undefined,
  rootArr: string[] | null
): LSoftBrowseAssemblyMode {
  if (tradeCategoryIds?.length) return "mhard_location";
  if (rootArr?.length) return "legacy_priority";
  return "nationwide";
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
        const targetInclusive = from + pageSize;
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
          posts: assembled.slice(from, from + pageSize),
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

  /**
   * Default browse (anchor + 거리 전체): LOCAL → NEARBY → NATIONWIDE.
   * Each tier is an exact SQL partition (`tierLocationQueryExtras`) — disjoint, union = eligible.
   * Returns null on DB failure so callers fall back / surface an error (never an empty list).
   */
  async function resolveBrowsePriorityPayloadForSb(
    sb: SupabaseClient<any>
  ): Promise<{ posts: PostWithMeta[]; hasMore: boolean } | null> {
    const feedConstraint = resolveTradeFeedLocationConstraint(lguCityId, radiusKm);
    if (feedConstraint.kind === "invalid") {
      return { posts: [], hasMore: false };
    }
    const tiers = resolveBrowseLocationTiers(feedConstraint);
    if (!tiers) {
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

    const targetInclusive = from + pageSize;
    const canSortByDistance = sort === "distance";
    /** distance: tier scan up to cap, then centroid re-sort; latest/popular: SQL order is final. */
    const rangeTo = canSortByDistance ? MARKETPLACE_DISTANCE_SCAN_CAP - 1 : targetInclusive;
    const anchorCanonicalId = tiers.anchorCanonicalId;

    const rootIds = queryExtras?.categoryPriorityRootTradeCategoryIds ?? null;
    const topicIds = queryExtras?.categoryPriorityTopicTradeCategoryIds ?? null;
    const rootArr = rootIds && rootIds.length > 0 ? rootIds : null;
    const topicArr = topicIds && topicIds.length > 0 ? topicIds : [];
    const lSoftMode = resolveLSoftBrowseAssemblyMode(tradeCategoryIds, rootArr);

    type CategorySegment = { tradeCatIds: string[] | null; excludeTradeCatIds: string[] | null };
    /** Category order inside one location tier (M-HARD / nationwide = single segment). */
    const categorySegments: CategorySegment[] =
      lSoftMode === "mhard_location"
        ? [{ tradeCatIds: tradeCategoryIds!, excludeTradeCatIds: null }]
        : lSoftMode === "nationwide"
          ? [{ tradeCatIds: null, excludeTradeCatIds: null }]
          : [
              ...(topicArr.length > 0
                ? [{ tradeCatIds: topicArr, excludeTradeCatIds: null }]
                : []),
              { tradeCatIds: rootArr, excludeTradeCatIds: topicArr.length > 0 ? topicArr : null },
              { tradeCatIds: null, excludeTradeCatIds: rootArr },
            ];

    const assembled: PostWithMeta[] = [];
    let scanCapHit = false;
    for (const tier of BROWSE_LOCATION_TIER_ORDER) {
      const loc = tierLocationQueryExtras(tiers, tier);
      if (!loc) continue;
      for (const seg of categorySegments) {
        if (assembled.length > targetInclusive) break;
        /** Chunked (≤ PostgREST max-rows) so a large tier is never silently truncated. */
        const fetched = await fetchHomePostsMappedRangeChunked(
          sb,
          POSTS_TABLE_READ,
          sort,
          type,
          seg.tradeCatIds,
          statusOr,
          loc,
          queryExtras,
          0,
          rangeTo,
          {
            applyLocation: true,
            excludeTradeCategoryIds: seg.excludeTradeCatIds,
          }
        );
        if (!fetched) return null;
        const rows = fetched.rows;
        if (!fetched.exhausted) scanCapHit = true;
        assembled.push(...sortBrowseListingsWithinLocationBlock(rows, sort, anchorCanonicalId));
      }
      if (assembled.length > targetInclusive) break;
    }

    return {
      posts: assembled.slice(from, from + pageSize),
      hasMore: assembled.length > targetInclusive || scanCapHit,
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
