/**
 * 거래 마켓 피드 페이지 조회 — 브라우저·Route Handler 공용 ("use client" 없음)
 */
import type { PostWithMeta } from "./schema";
import {
  postMetaMatchesJobListingKind,
  type JobListingKindFilter,
} from "@/lib/jobs/matches-job-listing-kind";
import {
  fetchPostsRangeForTradeCategories,
  MAX_JOB_LISTING_KIND_CHUNKS,
  PAGE_SIZE_TRADE_FEED,
  type TradeFeedQueryExtras,
  type TradePostSort,
} from "@/lib/posts/trade-posts-range-query";
import type { JobListIndustrySlug, JobListRegionSlug } from "@/lib/jobs/job-list-url-params";
import { resolveTradeFeedLocationConstraint } from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { tradeFeedLocationToQueryExtras } from "@/lib/trade/location/national/trade-feed-location-query-extras";
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
};

function buildQueryExtras(opts: TradeFeedPageOptions): TradeFeedQueryExtras | undefined {
  const restrictTradeTypeJob = opts.restrictTradeTypeJob === true;
  const je = opts.jobEmploymentType?.trim();
  const todayAvailable = opts.todayAvailable === true;
  const jr = opts.jobRegionSlug;
  const jc = opts.jobIndustrySlug;
  const statusOr = opts.statusOr?.trim();
  const lguCityId = opts.lguCityId?.trim();
  const feedConstraint = resolveTradeFeedLocationConstraint(lguCityId, opts.radiusKm);
  const tradeFeedLocation = tradeFeedLocationToQueryExtras(feedConstraint);
  const q = sanitizeMarketplaceQueryText(opts.q);
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
          const meta =
            p.meta && typeof p.meta === "object" && !Array.isArray(p.meta)
              ? (p.meta as Record<string, unknown>)
              : undefined;
          if (!postMetaMatchesJobListingKind(meta, jobKind)) continue;
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
