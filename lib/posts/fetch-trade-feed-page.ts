/**
 * 거래 마켓 피드 페이지 조회 — 브라우저·Route Handler 공용 ("use client" 없음)
 * CUT-SSOT-4: city browse + no q → philife L-SOFT path (`resolveHomePostsPayload`).
 * Default browse order LOCAL → NEARBY → NATIONWIDE (`browse-location-tiers`); job feeds keep
 * their trade_type=job filters on the same tiers (`fetchTieredJobTradeFeedPage`).
 */
import type { PostWithMeta } from "./schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  postMetaMatchesJobListingKind,
  type JobListingKindFilter,
} from "@/lib/jobs/matches-job-listing-kind";
import {
  fetchPostsRangeForTradeCategories,
  fetchPostsRangeForTradeCategoriesOrNull,
  MAX_JOB_LISTING_KIND_CHUNKS,
  PAGE_SIZE_TRADE_FEED,
  type TradeFeedQueryExtras,
  type TradePostSort,
} from "@/lib/posts/trade-posts-range-query";
import type { JobListIndustrySlug, JobListRegionSlug } from "@/lib/jobs/job-list-url-params";
import { resolveTradeFeedLocationConstraint } from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { shouldUseRegionAllBrowsePriority } from "@/lib/trade/location/national/trade-feed-location-sql-extras";
import { tradeFeedLocationToQueryExtras } from "@/lib/trade/location/national/trade-feed-location-query-extras";
import {
  BROWSE_LOCATION_TIER_ORDER,
  resolveBrowseLocationTiers,
  tierLocationQueryExtras,
  type BrowseLocationTiers,
} from "@/lib/trade/location/national/browse-location-tiers";
import {
  parseMarketplacePriceBound,
  parseMarketplaceSort,
  sanitizeMarketplaceQueryText,
} from "@/lib/trade/marketplace/query-contract";
import type { CompositionFilterClause } from "@/lib/trade/category-form/composition-filter-query";
import {
  MARKETPLACE_DISTANCE_SCAN_CAP,
  sortListingsByLguDistance,
} from "@/lib/trade/marketplace/sort-listings-by-lgu-distance";
import type { TradeSoftCategoryPriority } from "@/lib/posts/trade-soft-category-priority";
import {
  HOME_POSTS_SOLD_STATUS_OR,
  resolveHomePostsPayload,
  resolveHomePostsStatusOrByTradeState,
  type HomePostsQuerySort,
} from "@/lib/posts/home-posts-query-server";

export type TradeFeedPageSort = TradePostSort;

export type TradeFeedPageOptions = {
  page?: number;
  sort?: TradeFeedPageSort;
  jobsListingKind?: JobListingKindFilter;
  restrictTradeTypeJob?: boolean;
  jobEmploymentType?: string;
  todayAvailable?: boolean;
  jobRegionSlug?: JobListRegionSlug;
  jobIndustrySlug?: JobListIndustrySlug;
  /** `resolveHomePostsStatusOrByTradeState` 결과 */
  statusOr?: string;
  /** Trade LGU City scope (`?location=city&lgu=`) — alias or PSGC */
  lguCityId?: string;
  /** Browse radius km (`?radius=`) — only meaningful with lguCityId */
  radiusKm?: number | null;
  q?: string;
  priceMin?: number;
  priceMax?: number;
  compositionFilters?: CompositionFilterClause[];
  /**
   * 2026-10-27 Owner 목록 계약: 물품을 골라도 전체가 나오고 고른 물품이 앞(해당 → 유사 → 전체).
   * 주면 검색어 없는 일반(일자리 전용 조건 없는) 목록을 `resolveHomePostsPayload` 물품 구간으로 조립한다.
   */
  softCategoryPriority?: TradeSoftCategoryPriority;
};

function buildQueryExtras(opts: TradeFeedPageOptions): TradeFeedQueryExtras | undefined {
  const restrictTradeTypeJob = opts.restrictTradeTypeJob === true;
  const je = opts.jobEmploymentType?.trim();
  const todayAvailable = opts.todayAvailable === true;
  const jr = opts.jobRegionSlug;
  const jc = opts.jobIndustrySlug;
  const statusOr = opts.statusOr?.trim();
  const lguCityId = opts.lguCityId?.trim();
  const q = sanitizeMarketplaceQueryText(opts.q);
  const qAbsent = !q;
  const useBrowseSoft =
    Boolean(lguCityId) && shouldUseRegionAllBrowsePriority(lguCityId, opts.radiusKm, qAbsent);
  /** CUT-SSOT-4: browse L-SOFT — no hard SQL location wall (align philife). */
  const tradeFeedLocation = useBrowseSoft
    ? undefined
    : (() => {
        const feedConstraint = resolveTradeFeedLocationConstraint(lguCityId, opts.radiusKm);
        if (feedConstraint.kind === "all" || feedConstraint.kind === "invalid") return undefined;
        return tradeFeedLocationToQueryExtras(feedConstraint);
      })();
  const priceMin = parseMarketplacePriceBound(opts.priceMin);
  const priceMax = parseMarketplacePriceBound(opts.priceMax);
  const compositionFilters = opts.compositionFilters?.length ? opts.compositionFilters : undefined;

  if (
    !restrictTradeTypeJob &&
    !je &&
    !todayAvailable &&
    !jr &&
    !jc &&
    !statusOr &&
    !tradeFeedLocation &&
    !q &&
    priceMin == null &&
    priceMax == null &&
    !compositionFilters
  ) {
    return undefined;
  }
  return {
    restrictTradeTypeJob: restrictTradeTypeJob || undefined,
    jobEmploymentType: je || undefined,
    todayAvailable: todayAvailable || undefined,
    jobRegionSlug: jr || undefined,
    jobIndustrySlug: jc || undefined,
    statusOr: statusOr || undefined,
    tradeFeedLocation,
    q,
    priceMin,
    priceMax,
    compositionFilters,
  };
}

/** Region-priority / tiered trade feed query failed — never presented as an empty list. */
export class TradeFeedQueryError extends Error {
  constructor(message = "trade_feed_query_failed") {
    super(message);
    this.name = "TradeFeedQueryError";
  }
}

/** Trade feed sort → philife browse sort (popular must survive; near/distance → distance). */
export function tradeFeedSortToHomePostsSort(sort: TradeFeedPageSort | undefined): HomePostsQuerySort {
  if (sort === "popular") return "popular";
  if (parseMarketplaceSort(sort) === "distance") return "distance";
  return "latest";
}

function hasJobQueryExtras(opts: TradeFeedPageOptions): boolean {
  return (
    opts.restrictTradeTypeJob === true ||
    Boolean(opts.jobEmploymentType?.trim()) ||
    opts.todayAvailable === true ||
    Boolean(opts.jobRegionSlug) ||
    Boolean(opts.jobIndustrySlug)
  );
}

function rowMatchesJobKind(p: PostWithMeta, jobKind: JobListingKindFilter | undefined): boolean {
  if (jobKind !== "hire" && jobKind !== "work") return true;
  const meta =
    p.meta && typeof p.meta === "object" && !Array.isArray(p.meta)
      ? (p.meta as Record<string, unknown>)
      : undefined;
  return postMetaMatchesJobListingKind(meta, jobKind);
}

/**
 * Jobs (trade_type=job filters, hire/work kind) default browse: LOCAL → NEARBY → NATIONWIDE
 * on the trade-feed query (job filters live only here). Per tier: SQL partition, chunked scan
 * with row-level job-kind filter, user sort inside tier.
 */
async function fetchTieredJobTradeFeedPage(
  supabase: unknown,
  ids: string[],
  sort: TradeFeedPageSort,
  page: number,
  queryExtras: TradeFeedQueryExtras | undefined,
  tiers: BrowseLocationTiers,
  jobKind: JobListingKindFilter | undefined
): Promise<{ posts: PostWithMeta[]; hasMore: boolean }> {
  const PAGE_SIZE = PAGE_SIZE_TRADE_FEED;
  const targetStart = (page - 1) * PAGE_SIZE;
  const targetInclusive = targetStart + PAGE_SIZE;
  const useDistance = parseMarketplaceSort(sort) === "distance";
  const dbSort: TradePostSort = useDistance ? "latest" : sort;
  const maxChunks = useDistance
    ? Math.ceil(MARKETPLACE_DISTANCE_SCAN_CAP / PAGE_SIZE)
    : MAX_JOB_LISTING_KIND_CHUNKS;

  const assembled: PostWithMeta[] = [];
  let truncated = false;
  for (const tier of BROWSE_LOCATION_TIER_ORDER) {
    if (assembled.length > targetInclusive) break;
    const loc = tierLocationQueryExtras(tiers, tier);
    if (!loc) continue;
    const extras: TradeFeedQueryExtras = { ...(queryExtras ?? {}), tradeFeedLocation: loc };
    const tierRows: PostWithMeta[] = [];
    let dbOffset = 0;
    let chunks = 0;
    let exhausted = false;
    const need = () => (useDistance ? Number.POSITIVE_INFINITY : targetInclusive + 1 - assembled.length);
    while (tierRows.length < need() && chunks < maxChunks) {
      const chunk = await fetchPostsRangeForTradeCategoriesOrNull(
        supabase,
        ids,
        dbSort,
        dbOffset,
        dbOffset + PAGE_SIZE - 1,
        extras
      );
      if (!chunk) throw new TradeFeedQueryError();
      chunks++;
      for (const p of chunk) if (rowMatchesJobKind(p, jobKind)) tierRows.push(p);
      dbOffset += chunk.length;
      if (chunk.length < PAGE_SIZE) {
        exhausted = true;
        break;
      }
    }
    if (!exhausted && tierRows.length < need()) truncated = true;
    assembled.push(
      ...(useDistance ? sortListingsByLguDistance(tierRows, tiers.anchorCanonicalId) : tierRows)
    );
  }
  return {
    posts: assembled.slice(targetStart, targetStart + PAGE_SIZE),
    hasMore: assembled.length > targetInclusive || truncated,
  };
}

/**
 * Throws `TradeFeedQueryError` when a region-priority query fails (caller → error response).
 */
export async function fetchTradeFeedPage(
  supabase: unknown,
  categoryIds: string[],
  options: TradeFeedPageOptions = {}
): Promise<{ posts: PostWithMeta[]; hasMore: boolean }> {
  const ids = [...new Set(categoryIds.map((x) => x.trim()).filter(Boolean))];
  if (!supabase || ids.length === 0) {
    return { posts: [], hasMore: false };
  }

  const feedConstraint = resolveTradeFeedLocationConstraint(
    options.lguCityId,
    options.radiusKm
  );
  if (feedConstraint.kind === "invalid") {
    return { posts: [], hasMore: false };
  }

  const page = Math.max(1, options.page ?? 1);
  const sort = options.sort ?? "latest";
  const restrictJob = options.restrictTradeTypeJob === true;
  const jobKind = restrictJob ? options.jobsListingKind : undefined;
  const queryExtras = buildQueryExtras(options);
  const PAGE_SIZE = PAGE_SIZE_TRADE_FEED;
  const qAbsent = !sanitizeMarketplaceQueryText(options.q);
  const isJobFeedRequest = jobKind === "hire" || jobKind === "work" || hasJobQueryExtras(options);
  if (qAbsent && !isJobFeedRequest) {
    /** 목록 계약: 우선 정보가 없으면(categoryIds 직접 지정) 그 id 를 「해당 물품」, 나머지 거래 전체를 뒤에 둔다 */
    const prio: TradeSoftCategoryPriority = options.softCategoryPriority ?? {
      universeTradeCategoryIds: null,
      rootTradeCategoryIds: ids,
      topicTradeCategoryIds: [],
    };
    const from = (page - 1) * PAGE_SIZE;
    const soft = await resolveHomePostsPayload(
      supabase as SupabaseClient<any>,
      null,
      from,
      tradeFeedSortToHomePostsSort(sort),
      "trade",
      prio.universeTradeCategoryIds,
      options.statusOr?.trim() || resolveHomePostsStatusOrByTradeState("latest"),
      options.lguCityId,
      options.radiusKm,
      {
        /** 반경은 순서만 정한다 — `buildQueryExtras` 의 반경 SQL 벽(tradeFeedLocation)은 쓰지 않는다 */
        ...(queryExtras ? { ...queryExtras, tradeFeedLocation: undefined } : {}),
        categoryPriorityRootTradeCategoryIds: prio.rootTradeCategoryIds,
        categoryPriorityTopicTradeCategoryIds: prio.topicTradeCategoryIds,
        /** 목록 계약 ④ — 판매완료를 고르면 판매완료 → 판매중, 그 외 판매중 → 판매완료 */
        listTradeState: options.statusOr?.trim() === HOME_POSTS_SOLD_STATUS_OR ? "sold" : "all",
      },
      PAGE_SIZE
    );
    if (!soft) throw new TradeFeedQueryError();
    return soft;
  }

  const useBrowseSoft =
    Boolean(options.lguCityId?.trim()) &&
    shouldUseRegionAllBrowsePriority(options.lguCityId, options.radiusKm, qAbsent);
  const browseTiers = useBrowseSoft ? resolveBrowseLocationTiers(feedConstraint) : null;

  if (browseTiers) {
    const isJobFeed = jobKind === "hire" || jobKind === "work" || hasJobQueryExtras(options);
    if (isJobFeed) {
      return fetchTieredJobTradeFeedPage(
        supabase,
        ids,
        sort,
        page,
        queryExtras,
        browseTiers,
        jobKind
      );
    }
    /** Non-job: same L-SOFT assembler as `/api/philife/posts` (display parity). */
    const from = (page - 1) * PAGE_SIZE;
    const soft = await resolveHomePostsPayload(
      supabase as SupabaseClient<any>,
      null,
      from,
      tradeFeedSortToHomePostsSort(sort),
      "trade",
      ids,
      options.statusOr?.trim() || resolveHomePostsStatusOrByTradeState("latest"),
      options.lguCityId,
      options.radiusKm,
      queryExtras,
      PAGE_SIZE
    );
    if (!soft) throw new TradeFeedQueryError();
    return soft;
  }

  if (jobKind === "hire" || jobKind === "work") {
    const targetStart = (page - 1) * PAGE_SIZE;
    const targetEnd = targetStart + PAGE_SIZE;
    let matchIndex = 0;
    const out: PostWithMeta[] = [];
    let dbOffset = 0;
    let lastChunkLen = PAGE_SIZE;
    let chunks = 0;

    try {
      while (out.length < PAGE_SIZE && lastChunkLen === PAGE_SIZE && chunks < MAX_JOB_LISTING_KIND_CHUNKS) {
        const chunk = await fetchPostsRangeForTradeCategories(
          supabase,
          ids,
          sort,
          dbOffset,
          dbOffset + PAGE_SIZE - 1,
          queryExtras
        );
        lastChunkLen = chunk.length;
        chunks++;
        for (const p of chunk) {
          if (!rowMatchesJobKind(p, jobKind)) continue;
          if (matchIndex >= targetStart && matchIndex < targetEnd) {
            out.push(p);
          }
          matchIndex++;
        }
        dbOffset += chunk.length;
        if (chunk.length < PAGE_SIZE) break;
      }
      const hasMore =
        lastChunkLen === PAGE_SIZE && chunks < MAX_JOB_LISTING_KIND_CHUNKS;
      return { posts: out, hasMore };
    } catch {
      return { posts: [], hasMore: false };
    }
  }

  const from = (page - 1) * PAGE_SIZE;
  const marketplaceSort = parseMarketplaceSort(sort);
  const useDistance =
    marketplaceSort === "distance" &&
    jobKind !== "hire" &&
    jobKind !== "work" &&
    feedConstraint.kind === "lgu";

  try {
    if (useDistance) {
      const scanned = await fetchPostsRangeForTradeCategories(
        supabase,
        ids,
        "latest",
        0,
        MARKETPLACE_DISTANCE_SCAN_CAP - 1,
        queryExtras
      );
      const sorted = sortListingsByLguDistance(scanned, feedConstraint.canonicalId);
      const posts = sorted.slice(from, from + PAGE_SIZE);
      return {
        posts,
        hasMore:
          sorted.length > from + PAGE_SIZE || scanned.length >= MARKETPLACE_DISTANCE_SCAN_CAP,
      };
    }
    const posts = await fetchPostsRangeForTradeCategories(
      supabase,
      ids,
      sort,
      from,
      from + PAGE_SIZE - 1,
      queryExtras
    );
    return { posts, hasMore: posts.length === PAGE_SIZE };
  } catch {
    return { posts: [], hasMore: false };
  }
}
