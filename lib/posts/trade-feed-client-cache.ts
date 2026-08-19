/**
 * 브라우저 메모리 trade 피드 캐시 — `GET /api/trade/feed` 왕복 완화.
 * `use client` 없음: `toggleFavorite` 등에서 가볍게 무효화만 import 가능.
 */
import { forgetSingleFlightsWhere } from "@/lib/http/run-single-flight";
import { pruneByExpiresAtAndMaxSize } from "@/lib/http/memory-map-prune";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";
import { resolveTradeLguUrlTokenToCanonical } from "@/lib/trade/location/national/legacy-product-alias-canonical";
import {
  sanitizeTradeBrowseRadiusKm,
  tradeBrowseRadiusCacheSegment,
} from "@/lib/trade/location/trade-browse-radius";
import { marketplaceQueryCacheSegment } from "@/lib/trade/marketplace/query-contract";
import {
  appendCompositionFilterSearchParams,
  compositionFilterCacheSegment,
  type CompositionFilterSelection,
} from "@/lib/trade/category-form/composition-filter-query";
import { parseMarketplacePublicTradeState } from "@/lib/trade/marketplace/public-listing-status";

export type TradeFeedClientSort = "latest" | "popular" | "pay_desc" | "chat_desc" | "near";

export type TradeFeedClientOptions = {
  page?: number;
  sort?: TradeFeedClientSort;
  jobsListingKind?: JobListingKindFilter;
  tradeMarketParent?: string;
  topic?: string;
  jobEmploymentType?: string;
  todayAvailable?: boolean;
  jobRegionSlug?: string;
  jobIndustrySlug?: string;
  /** 거래 상태 필터 — 홈 `tradeState` 와 동일 */
  tradeState?: "latest" | "active" | "reserved" | "sold";
  /** LGU City scope id (`pasig`, `quezon-city`, …) */
  lguCityId?: string;
  /** Browse radius km */
  radiusKm?: number | null;
  /** Explicit nationwide */
  locationAll?: boolean;
  q?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  compositionFilters?: CompositionFilterSelection | null;
};

export type TradeFeedClientResult = {
  posts: PostWithMeta[];
  hasMore: boolean;
  favoriteMap?: Record<string, boolean>;
};

export const TRADE_FEED_CLIENT_TTL_MS = 45_000;

type TradeFeedCacheEntry = {
  data: TradeFeedClientResult;
  expiresAt: number;
};

const tradeFeedClientCache = new Map<string, TradeFeedCacheEntry>();
const TRADE_FEED_CLIENT_CACHE_MAX_KEYS = 100;

/** `invalidateAllTradeFeedClientCache` 시 증가 — 진행 중 fetch 가 stale 캐시를 쓰지 않게 함 */
let tradeFeedClientInvalidationGeneration = 0;

export function getTradeFeedClientInvalidationGeneration(): number {
  return tradeFeedClientInvalidationGeneration;
}

function capTradeFeedClientCache(): void {
  pruneByExpiresAtAndMaxSize(tradeFeedClientCache, Date.now(), TRADE_FEED_CLIENT_CACHE_MAX_KEYS);
}

/**
 * `viewerSegment`: `getCurrentUser()?.id ?? "anon"` (클라이언트에서만 의미 있음)
 */
export function buildTradeFeedClientCacheKey(
  categoryIds: string[],
  options: TradeFeedClientOptions,
  viewerSegment: string
): string {
  const page = Math.max(1, options.page ?? 1);
  const sort = options.sort ?? "latest";
  const u = viewerSegment.trim() || "anon";
  const je = options.jobEmploymentType?.trim().toLowerCase() ?? "";
  const av = options.todayAvailable === true ? "1" : "";
  const jr = options.jobRegionSlug?.trim().toLowerCase() ?? "";
  const jc = options.jobIndustrySlug?.trim().toLowerCase() ?? "";
  const ts = parseMarketplacePublicTradeState(options.tradeState);
  const loc = (() => {
    const raw = options.lguCityId?.trim();
    if (raw) {
      const cid = resolveTradeLguUrlTokenToCanonical(raw);
      if (!cid) return `loc:invalid:${raw}`;
      const r =
        options.radiusKm == null
          ? null
          : sanitizeTradeBrowseRadiusKm(options.radiusKm);
      return `loc:lgu:${cid}:${tradeBrowseRadiusCacheSegment(r)}`;
    }
    if (options.locationAll === true) return "loc:all";
    return "loc:unset";
  })();
  const querySegment = marketplaceQueryCacheSegment({
    q: options.q,
    priceMin: options.priceMin,
    priceMax: options.priceMax,
    sort,
  });
  const sel = options.compositionFilters;
  const cfSuffix =
    sel && Object.keys(sel).length > 0 ? `|${compositionFilterCacheSegment(sel)}` : "";
  const parent = options.tradeMarketParent?.trim();
  if (parent) {
    const topic = (options.topic ?? "").trim().normalize("NFC");
    const jk =
      options.jobsListingKind === "hire" || options.jobsListingKind === "work"
        ? options.jobsListingKind
        : "";
    return `mp:${parent}|t:${topic}|${sort}|jk:${jk}|je:${je}|av:${av}|jr:${jr}|jc:${jc}|ts:${ts}|${loc}|${querySegment}${cfSuffix}|p:${page}|u:${u}:v6`;
  }
  const ids = [...new Set(categoryIds.map((x) => x.trim()).filter(Boolean))].sort();
  const jk =
    options.jobsListingKind === "hire" || options.jobsListingKind === "work"
      ? options.jobsListingKind
      : "";
  return `ids:${ids.join(",")}|${sort}|jk:${jk}|je:${je}|av:${av}|jr:${jr}|jc:${jc}|ts:${ts}|${loc}|${querySegment}${cfSuffix}|p:${page}|u:${u}:v6`;
}

/** 글 등록·수정 직후 등 — `/api/trade/feed` 클라이언트 캐시 전부 비움 */
export function invalidateAllTradeFeedClientCache(): void {
  forgetSingleFlightsWhere((k) => typeof k === "string" && k.startsWith("trade-feed-fetch:"));
  tradeFeedClientInvalidationGeneration += 1;
  tradeFeedClientCache.clear();
}

/** 찜 토글 성공 후 — 서버 무효화와 맞춰 뷰어별 엔트리 제거 */
export function invalidateTradeFeedClientCacheForViewer(viewerUserId: string): void {
  const u = viewerUserId.trim();
  if (!u) return;
  const suffix = `|u:${u}:v6`;
  for (const k of [...tradeFeedClientCache.keys()]) {
    if (k.endsWith(suffix)) tradeFeedClientCache.delete(k);
  }
}

export function peekCachedTradeFeed(
  categoryIds: string[],
  options: TradeFeedClientOptions,
  viewerSegment: string
): TradeFeedClientResult | null {
  const key = buildTradeFeedClientCacheKey(categoryIds, options, viewerSegment);
  const hit = tradeFeedClientCache.get(key);
  if (!hit) return null;
  if (!hit.data.posts?.length) return null;
  return hit.data;
}

export function isCachedTradeFeedFresh(
  categoryIds: string[],
  options: TradeFeedClientOptions,
  viewerSegment: string
): boolean {
  const key = buildTradeFeedClientCacheKey(categoryIds, options, viewerSegment);
  const hit = tradeFeedClientCache.get(key);
  return !!hit && hit.expiresAt > Date.now();
}

export function primeTradeFeedCache(
  categoryIds: string[],
  options: TradeFeedClientOptions,
  data: TradeFeedClientResult,
  viewerSegment: string
): void {
  const key = buildTradeFeedClientCacheKey(categoryIds, options, viewerSegment);
  tradeFeedClientCache.set(key, {
    data,
    expiresAt: Date.now() + TRADE_FEED_CLIENT_TTL_MS,
  });
  capTradeFeedClientCache();
}

export function readTradeFeedClientCache(
  categoryIds: string[],
  options: TradeFeedClientOptions,
  viewerSegment: string
): TradeFeedCacheEntry | undefined {
  return tradeFeedClientCache.get(
    buildTradeFeedClientCacheKey(categoryIds, options, viewerSegment)
  );
}

export function writeTradeFeedClientCache(
  categoryIds: string[],
  options: TradeFeedClientOptions,
  viewerSegment: string,
  data: TradeFeedClientResult
): void {
  const key = buildTradeFeedClientCacheKey(categoryIds, options, viewerSegment);
  tradeFeedClientCache.set(key, {
    data,
    expiresAt: Date.now() + TRADE_FEED_CLIENT_TTL_MS,
  });
  capTradeFeedClientCache();
}
