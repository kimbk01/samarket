"use client";

import { pruneByExpiresAtAndMaxSize } from "@/lib/http/memory-map-prune";
import { forgetSingleFlightsWhere, runSingleFlight } from "@/lib/http/run-single-flight";
import { invalidateAllTradeFeedClientCache } from "@/lib/posts/trade-feed-client-cache";
import { recordAppWidePhaseLastMs, samarketRuntimeDebugEnabled } from "@/lib/runtime/samarket-runtime-debug";
import { recordTradeListPayloadBytes } from "@/lib/trade/trade-c2c-perf-metrics";
import { resolveTradeLguUrlTokenToCanonical } from "@/lib/trade/location/national/legacy-product-alias-canonical";
import {
  sanitizeTradeBrowseRadiusKm,
  tradeBrowseRadiusCacheSegment,
} from "@/lib/trade/location/trade-browse-radius";
import {
  appendMarketplaceLocationSearchParams,
  appendMarketplaceQuerySearchParams,
  marketplaceQueryCacheSegment,
  parseMarketplacePriceBound,
  sanitizeMarketplaceQueryText,
} from "@/lib/trade/marketplace/query-contract";
import {
  appendCompositionFilterSearchParams,
  compositionFilterCacheSegment,
  type CompositionFilterSelection,
} from "@/lib/trade/category-form/composition-filter-query";
import { parseMarketplacePublicTradeState } from "@/lib/trade/marketplace/public-listing-status";
import { DIBAY_MARKET_FRESH_FEED_HEADER } from "@/lib/trade/marketplace/market-fresh-feed-header";
import type { PostWithMeta } from "./schema";

export type HomePostSort = "latest" | "popular" | "distance";
export type HomeTradeStateFilter = "latest" | "active" | "reserved" | "sold";

export interface GetPostsForHomeOptions {
  page?: number;
  sort?: HomePostSort;
  /** 타입 필터. null/미지정 시 전체 등록 상품 조회 */
  type?: "trade" | "community" | "service" | "feature" | null;
  /**
   * 거래 1차 메뉴(중고거래·부동산 등) UUID — 서버에서 하위 카테고리까지 펼쳐 필터.
   * 미지정이면 전체 거래 피드.
   *
   * - `tradeMarketParentIds`를 지정하면 이 값은 "primary root"로 취급됩니다.
   */
  tradeMarketParentId?: string | null;
  /**
   * ROOT multi selection용.
   * - 서버에서 root → 하위 카테고리 확장 및 topic-by-root 우선순위에 사용됩니다.
   */
  tradeMarketParentIds?: string[] | null;
  /**
   * ROOT별 optional child(topic) selection.
   * - 값은 슬러그 또는 UUID 키를 그대로 전달(서버에서 카테고리 id로 resolve)합니다.
   * - root에 topic이 없으면 해당 root key 자체를 생략합니다.
   */
  tradeTopicByParent?: Record<string, string | null> | null;
  /** 전체 거래 정렬/상태 필터 */
  tradeState?: HomeTradeStateFilter;
  /** Trade LGU City scope (`pasig`, …). Requires locationAll=false */
  lguCityId?: string | null;
  /** Browse radius km — only with lguCityId */
  radiusKm?: number | null;
  /** Explicit nationwide. Missing location + missing this = do not fetch. */
  locationAll?: boolean;
  q?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  compositionFilters?: CompositionFilterSelection | null;
  /** PTR: server ranked-window + API cache bust (internal header only). */
  forceFreshRankedWindow?: boolean;
}

export interface GetPostsForHomeResult {
  posts: PostWithMeta[];
  hasMore: boolean;
  favoriteMap: Record<string, boolean>;
}

const HOME_POSTS_TTL_MS = 45_000;
const HOME_POSTS_SESSION_CACHE_KEY_PREFIX = "samarket:home-posts:v1:";
const HOME_POSTS_LOCAL_TTL_MS = 1000 * 60 * 60 * 24;
const HOME_POSTS_LOCAL_CACHE_KEY_PREFIX = "samarket:home-posts:local:v1:";

type HomePostsCacheEntry = {
  data: GetPostsForHomeResult;
  expiresAt: number;
};

const homePostsCache = new Map<string, HomePostsCacheEntry>();
const HOME_CLIENT_POSTS_CACHE_MAX_KEYS = 80;

/** `invalidateHomePostsCache` 시 증가 — 무효화 직후 끝나는 in-flight 가 stale 캐시를 쓰지 않게 함 */
let homePostsInvalidationGeneration = 0;

function capHomePostsClientCache(): void {
  pruneByExpiresAtAndMaxSize(homePostsCache, Date.now(), HOME_CLIENT_POSTS_CACHE_MAX_KEYS);
}

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function makeSessionCacheKey(cacheKey: string): string {
  return `${HOME_POSTS_SESSION_CACHE_KEY_PREFIX}${cacheKey}`;
}

function makeLocalCacheKey(cacheKey: string): string {
  return `${HOME_POSTS_LOCAL_CACHE_KEY_PREFIX}${cacheKey}`;
}

function readHomePostsSessionCache(cacheKey: string): GetPostsForHomeResult | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(makeSessionCacheKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      expiresAt?: number;
      data?: GetPostsForHomeResult;
    };
    if (!parsed || typeof parsed.expiresAt !== "number" || !Number.isFinite(parsed.expiresAt) || !parsed.data) {
      return null;
    }
    /** local reader 와 동일: `expiresAt < now` 만료(ms). `=== now` 는 아직 hit. */
    if (parsed.expiresAt < Date.now()) {
      try {
        window.sessionStorage.removeItem(makeSessionCacheKey(cacheKey));
      } catch {
        /* ignore */
      }
      return null;
    }
    const data = parsed.data;
    if (!Array.isArray(data.posts) || typeof data.favoriteMap !== "object" || data.favoriteMap == null) {
      return null;
    }
    return {
      posts: data.posts,
      hasMore: data.hasMore === true,
      favoriteMap: data.favoriteMap ?? {},
    };
  } catch {
    return null;
  }
}

function readHomePostsLocalCache(cacheKey: string): GetPostsForHomeResult | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(makeLocalCacheKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      expiresAt?: number;
      data?: GetPostsForHomeResult;
    };
    if (!parsed || typeof parsed.expiresAt !== "number" || !parsed.data) return null;
    if (parsed.expiresAt < Date.now()) {
      try {
        window.localStorage.removeItem(makeLocalCacheKey(cacheKey));
      } catch {
        /* ignore */
      }
      return null;
    }
    const data = parsed.data;
    if (!Array.isArray(data.posts) || typeof data.favoriteMap !== "object") return null;
    return {
      posts: data.posts,
      hasMore: data.hasMore === true,
      favoriteMap: data.favoriteMap ?? {},
    };
  } catch {
    return null;
  }
}

function writeHomePostsSessionCache(cacheKey: string, data: GetPostsForHomeResult): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(
      makeSessionCacheKey(cacheKey),
      JSON.stringify({
        expiresAt: Date.now() + HOME_POSTS_TTL_MS,
        data,
      })
    );
  } catch {
    /* quota/private mode */
  }
}

function writeHomePostsLocalCache(cacheKey: string, data: GetPostsForHomeResult): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(
      makeLocalCacheKey(cacheKey),
      JSON.stringify({
        expiresAt: Date.now() + HOME_POSTS_LOCAL_TTL_MS,
        data,
      })
    );
  } catch {
    /* quota/private mode */
  }
}

function normalizeOptions(options: GetPostsForHomeOptions = {}) {
  const page = Math.max(1, options.page ?? 1);
  const sort = options.sort === "popular" || options.sort === "distance" ? options.sort : "latest";
  const typeFilter = options.type ?? null;
  const tradeMarketParentIds =
    options.tradeMarketParentIds && Array.isArray(options.tradeMarketParentIds)
      ? options.tradeMarketParentIds.map((x) => x?.trim()).filter(Boolean)
      : null;
  const primaryTradeMarketParentId =
    tradeMarketParentIds && tradeMarketParentIds.length > 0
      ? tradeMarketParentIds[0]!
      : options.tradeMarketParentId?.trim() || null;
  const tradeMarketParent = primaryTradeMarketParentId;
  const topicPairs =
    options.tradeTopicByParent && typeof options.tradeTopicByParent === "object" ? options.tradeTopicByParent : null;
  const tradeState = parseMarketplacePublicTradeState(options.tradeState);
  const lguCityId = options.lguCityId?.trim() || null;
  const locationAll = options.locationAll === true && !lguCityId;
  const radiusKm = lguCityId
    ? options.radiusKm == null
      ? null
      : sanitizeTradeBrowseRadiusKm(options.radiusKm)
    : null;
  const q = sanitizeMarketplaceQueryText(options.q);
  const priceMin = parseMarketplacePriceBound(options.priceMin ?? undefined);
  const priceMax = parseMarketplacePriceBound(options.priceMax ?? undefined);
  const compositionFilters = options.compositionFilters ?? {};
  const marketKey = (() => {
    if (!tradeMarketParentIds || tradeMarketParentIds.length === 0) return tradeMarketParent ?? "all";
    const rootsKey = [...new Set(tradeMarketParentIds)].sort().join(",");
    const pairs: string[] = [];
    if (topicPairs) {
      for (const [rid, t] of Object.entries(topicPairs)) {
        const rootId = rid?.trim();
        const topicKey = t?.trim();
        if (!rootId || !topicKey) continue;
        if (!tradeMarketParentIds.includes(rootId)) continue;
        pairs.push(`${rootId}:${topicKey}`);
      }
    }
    pairs.sort();
    const topicsKey = pairs.length > 0 ? `:t:${pairs.join(",")}` : "";
    return `roots:${rootsKey}${topicsKey}`;
  })();
  const loc = (() => {
    if (lguCityId) {
      const cid = resolveTradeLguUrlTokenToCanonical(lguCityId);
      if (!cid) return `loc:invalid:${lguCityId}`;
      return `loc:lgu:${cid}:${tradeBrowseRadiusCacheSegment(radiusKm)}`;
    }
    if (locationAll) return "loc:all";
    return "loc:unset";
  })();
  const querySegment = marketplaceQueryCacheSegment({ q, priceMin, priceMax, sort });
  const cfSegment = compositionFilterCacheSegment(compositionFilters);
  /** v9: CUT C SEARCH candidate expansion window (not title-ILIKE rerank) */
  const cacheKey = `${page}:${sort}:${typeFilter ?? "all"}:m:${marketKey}:ts:${tradeState}:${loc}:${querySegment}${
    Object.keys(compositionFilters).length > 0 ? `:${cfSegment}` : ""
  }:v9`;
  return {
    page,
    sort,
    typeFilter,
    tradeMarketParent,
    tradeMarketParentIds,
    tradeTopicByParent: topicPairs,
    tradeState,
    lguCityId,
    radiusKm,
    locationAll,
    q,
    priceMin,
    priceMax,
    compositionFilters,
    canFetch: Boolean(lguCityId || locationAll),
    cacheKey,
    forceFreshRankedWindow: options.forceFreshRankedWindow === true,
  };
}

function applyHomePostsRequestParams(
  params: URLSearchParams,
  opts: ReturnType<typeof normalizeOptions>
): void {
  if (opts.typeFilter) params.set("type", opts.typeFilter);
  if (opts.tradeMarketParent) params.set("tradeMarketParent", opts.tradeMarketParent);
  if (opts.tradeMarketParentIds && opts.tradeMarketParentIds.length > 0) {
    // UUID 리스트
    params.set("tradeMarketParentIds", [...new Set(opts.tradeMarketParentIds)].sort().join(","));
    if (opts.tradeTopicByParent) {
      const pairs: string[] = [];
      for (const [rid, t] of Object.entries(opts.tradeTopicByParent)) {
        const rootId = rid?.trim();
        const topicKey = t?.trim();
        if (!rootId || !topicKey) continue;
        if (!opts.tradeMarketParentIds.includes(rootId)) continue;
        pairs.push(`${rootId}:${topicKey}`);
      }
      pairs.sort();
      if (pairs.length > 0) params.set("tradeTopicByParent", pairs.join(","));
    }
  }
  if (opts.tradeState && opts.tradeState !== "latest") params.set("tradeState", opts.tradeState);
  appendMarketplaceLocationSearchParams(params, {
    locationAll: opts.locationAll,
    lguCityId: opts.lguCityId,
    radiusKm: opts.radiusKm,
  });
  appendMarketplaceQuerySearchParams(params, {
    q: opts.q,
    priceMin: opts.priceMin,
    priceMax: opts.priceMax,
  });
  appendCompositionFilterSearchParams(params, opts.compositionFilters);
}

function restoreHomePostsFromStorageToMemory(cacheKey: string): GetPostsForHomeResult | null {
  const sessionHit = readHomePostsSessionCache(cacheKey);
  const localHit = sessionHit ?? readHomePostsLocalCache(cacheKey);
  if (!localHit) return null;
  homePostsCache.set(cacheKey, {
    data: localHit,
    expiresAt: Date.now() + HOME_POSTS_TTL_MS,
  });
  capHomePostsClientCache();
  return localHit;
}

export function peekCachedPostsForHome(
  options: GetPostsForHomeOptions = {}
): GetPostsForHomeResult | null {
  const { cacheKey } = normalizeOptions(options);
  const cached = homePostsCache.get(cacheKey);
  if (cached && cached.data.posts.length > 0) {
    return cached.data;
  }
  return restoreHomePostsFromStorageToMemory(cacheKey);
}

/** Exact browse cache key — SSOT with `normalizeOptions` (list transition / replace). */
export function getHomePostsBrowseCacheKey(options: GetPostsForHomeOptions = {}): string {
  return normalizeOptions(options).cacheKey;
}

export function isCachedPostsForHomeFresh(
  options: GetPostsForHomeOptions = {}
): boolean {
  const { cacheKey } = normalizeOptions(options);
  const cached = homePostsCache.get(cacheKey);
  return !!cached && cached.expiresAt > Date.now();
}

/**
 * 정확 키 캐시 미스 시에도 최근 성공 목록을 즉시 보여주기 위한 fallback.
 * - 만료되지 않은 항목 중 가장 최근 항목을 선택
 * - 빈 목록은 제외(빈값 깜빡임 방지)
 */
export function peekRecentHomePostsFallback(): GetPostsForHomeResult | null {
  let latest: { at: number; data: GetPostsForHomeResult } | null = null;
  for (const entry of homePostsCache.values()) {
    if (!entry.data.posts?.length) continue;
    if (!latest || entry.expiresAt > latest.at) {
      latest = { at: entry.expiresAt, data: entry.data };
    }
  }
  return latest?.data ?? null;
}

/** RSC 시드와 클라이언트 캐시 키를 맞춰 첫 로드 후 재방문 시 중복 요청을 줄인다 */
export function primeHomePostsCache(
  options: GetPostsForHomeOptions = {},
  data: GetPostsForHomeResult
): void {
  const { cacheKey } = normalizeOptions(options);
  homePostsCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + HOME_POSTS_TTL_MS,
  });
  capHomePostsClientCache();
  writeHomePostsSessionCache(cacheKey, data);
  writeHomePostsLocalCache(cacheKey, data);
}

/** `HomeProductList`·`PostListByCategory` 가 네트워크로 다시 채우도록 구독 */
export const TRADE_POST_LIST_CACHE_INVALIDATED = "samarket:trade-post-list-cache-invalidated:v1" as const;

export type InvalidateHomePostsCacheOptions = {
  /**
   * false — `TRADE_POST_LIST_CACHE_INVALIDATED` 미발행.
   * PTR 등 핸들러가 직접 `await load()` 할 때 이벤트·핸들러 이중 `load()` 방지.
   */
  notifyListReload?: boolean;
};

/**
 * 글 등록/수정 직후 거래 목록이 즉시 갱신되도록 캐시를 비운다.
 * - 홈 `/market` — in-memory + sessionStorage(`samarket:home-posts:v1:*`)
 * - 카테고리 `/market/…` — trade 피드 클라이언트 캐시(`trade-feed-client-cache`)
 * - 이미 마운트된 목록은 커스텀 이벤트로 `load()` 재실행
 */
export function invalidateHomePostsCache(options?: InvalidateHomePostsCacheOptions): void {
  const notifyListReload = options?.notifyListReload !== false;
  forgetSingleFlightsWhere((k) => typeof k === "string" && k.startsWith("home-posts-fetch:"));
  homePostsInvalidationGeneration += 1;
  homePostsCache.clear();
  invalidateAllTradeFeedClientCache();
  if (!canUseSessionStorage()) {
    if (notifyListReload) dispatchTradePostListCacheInvalidated();
    return;
  }
  try {
    const prefix = HOME_POSTS_SESSION_CACHE_KEY_PREFIX;
    const removeKeys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      removeKeys.push(key);
    }
    for (const key of removeKeys) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
  if (canUseLocalStorage()) {
    try {
      const prefix = HOME_POSTS_LOCAL_CACHE_KEY_PREFIX;
      const removeKeys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        removeKeys.push(key);
      }
      for (const key of removeKeys) {
        window.localStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
  }
  if (notifyListReload) dispatchTradePostListCacheInvalidated();
}

function dispatchTradePostListCacheInvalidated(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(TRADE_POST_LIST_CACHE_INVALIDATED));
  } catch {
    /* ignore */
  }
}

/**
 * 홈/물건 등록 리스트용 게시글 조회 (어드민 posts와 동일 테이블)
 * - status: hidden 제외, sold(거래완료)는 홈 목록 미노출
 *
 * **계약 (재발 방지 — `docs/trade-lightweight-design.md` §9, `TRADE_HOME_LIST_INVARIANT_IDS`):**
 * - 동일 `cacheKey`로 prewarm·`HomeProductList`가 합류하려면 **`opts.signal` 없이** 호출한다.
 *   `signal`이 있으면 내부 `runSingleFlight(\`home-posts-fetch:${cacheKey}\`)`를 타지 않아 **이중 fetch**가 난다.
 * - `peekCachedPostsForHome`는 메모리 미스 시에도 sessionStorage 복원을 시도한다.
 */
export async function getPostsForHome(
  options: GetPostsForHomeOptions = {},
  opts: { signal?: AbortSignal } = {}
): Promise<GetPostsForHomeResult> {
  const normalized = normalizeOptions(options);
  const { page, sort, cacheKey, canFetch } = normalized;
  if (!canFetch) {
    return { posts: [], hasMore: false, favoriteMap: {} };
  }
  const genAtEnter = homePostsInvalidationGeneration;
  const cached = homePostsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (genAtEnter !== homePostsInvalidationGeneration) {
      homePostsCache.delete(cacheKey);
      return getPostsForHome(options, opts);
    }
    return cached.data;
  }
  if (!cached) {
    const storageRestored = restoreHomePostsFromStorageToMemory(cacheKey);
    if (storageRestored) {
      if (genAtEnter !== homePostsInvalidationGeneration) {
        homePostsCache.delete(cacheKey);
        if (canUseSessionStorage()) {
          try {
            window.sessionStorage.removeItem(makeSessionCacheKey(cacheKey));
          } catch {
            /* ignore */
          }
        }
        if (canUseLocalStorage()) {
          try {
            window.localStorage.removeItem(makeLocalCacheKey(cacheKey));
          } catch {
            /* ignore */
          }
        }
        return getPostsForHome(options, opts);
      }
      return storageRestored;
    }
  }

  if (opts.signal) {
    try {
      const params = new URLSearchParams({
        page: String(page),
        sort,
      });
      applyHomePostsRequestParams(params, normalized);

      const dbg = samarketRuntimeDebugEnabled();
      const wallT0 = dbg ? performance.now() : 0;
      const tNet0 = dbg ? performance.now() : 0;
      const res = await fetch(`/api/philife/posts?${params.toString()}`, {
        credentials: "include",
        signal: opts.signal,
        headers: normalized.forceFreshRankedWindow
          ? { [DIBAY_MARKET_FRESH_FEED_HEADER]: "1" }
          : undefined,
      });
      if (dbg) {
        recordAppWidePhaseLastMs("trade_home_posts_fetch_network_ms", Math.round(performance.now() - tNet0));
      }
      if (!res.ok) {
        return { posts: [], hasMore: false, favoriteMap: {} };
      }

      const tJson0 = dbg ? performance.now() : 0;
      const data = (await res.json()) as {
        posts?: PostWithMeta[];
        hasMore?: boolean;
        favoriteMap?: Record<string, boolean>;
      };
      if (dbg) {
        recordAppWidePhaseLastMs("trade_home_posts_fetch_json_ms", Math.round(performance.now() - tJson0));
        try {
          recordTradeListPayloadBytes(new TextEncoder().encode(JSON.stringify(data)).length);
        } catch {
          /* ignore estimate errors */
        }
      }
      const tBuild0 = dbg ? performance.now() : 0;
      const result = {
        posts: Array.isArray(data.posts) ? data.posts : [],
        hasMore: data.hasMore === true,
        favoriteMap: data.favoriteMap && typeof data.favoriteMap === "object" ? data.favoriteMap : {},
      };
      if (genAtEnter !== homePostsInvalidationGeneration) {
        return getPostsForHome(options, {});
      }
      homePostsCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + HOME_POSTS_TTL_MS,
      });
      capHomePostsClientCache();
      writeHomePostsSessionCache(cacheKey, result);
      writeHomePostsLocalCache(cacheKey, result);
      if (dbg) {
        recordAppWidePhaseLastMs("trade_home_posts_result_build_ms", Math.round(performance.now() - tBuild0));
        recordAppWidePhaseLastMs("trade_home_posts_fetch_wall_ms", Math.round(performance.now() - wallT0));
      }
      return result;
    } catch {
      return { posts: [], hasMore: false, favoriteMap: {} };
    }
  }

  return runSingleFlight(`home-posts-fetch:${cacheKey}`, async () => {
    const genAt = homePostsInvalidationGeneration;
    const again = homePostsCache.get(cacheKey);
    if (again && again.expiresAt > Date.now()) {
      if (genAt !== homePostsInvalidationGeneration) {
        return getPostsForHome(options, opts);
      }
      return again.data;
    }

    try {
      const params = new URLSearchParams({
        page: String(page),
        sort,
      });
      applyHomePostsRequestParams(params, normalized);

      const dbg = samarketRuntimeDebugEnabled();
      const wallT0 = dbg ? performance.now() : 0;
      const tNet0 = dbg ? performance.now() : 0;
      const res = await fetch(`/api/philife/posts?${params.toString()}`, {
        credentials: "include",
        headers: normalized.forceFreshRankedWindow
          ? { [DIBAY_MARKET_FRESH_FEED_HEADER]: "1" }
          : undefined,
      });
      if (dbg) {
        recordAppWidePhaseLastMs("trade_home_posts_fetch_network_ms", Math.round(performance.now() - tNet0));
      }
      if (!res.ok) {
        return { posts: [], hasMore: false, favoriteMap: {} };
      }

      const tJson0 = dbg ? performance.now() : 0;
      const data = (await res.json()) as {
        posts?: PostWithMeta[];
        hasMore?: boolean;
        favoriteMap?: Record<string, boolean>;
      };
      if (dbg) {
        recordAppWidePhaseLastMs("trade_home_posts_fetch_json_ms", Math.round(performance.now() - tJson0));
        try {
          recordTradeListPayloadBytes(new TextEncoder().encode(JSON.stringify(data)).length);
        } catch {
          /* ignore estimate errors */
        }
      }
      const tBuild0 = dbg ? performance.now() : 0;
      const result = {
        posts: Array.isArray(data.posts) ? data.posts : [],
        hasMore: data.hasMore === true,
        favoriteMap: data.favoriteMap && typeof data.favoriteMap === "object" ? data.favoriteMap : {},
      };
      if (genAt !== homePostsInvalidationGeneration) {
        return getPostsForHome(options, opts);
      }
      homePostsCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + HOME_POSTS_TTL_MS,
      });
      capHomePostsClientCache();
      writeHomePostsSessionCache(cacheKey, result);
      writeHomePostsLocalCache(cacheKey, result);
      if (dbg) {
        recordAppWidePhaseLastMs("trade_home_posts_result_build_ms", Math.round(performance.now() - tBuild0));
        recordAppWidePhaseLastMs("trade_home_posts_fetch_wall_ms", Math.round(performance.now() - wallT0));
      }
      return result;
    } catch {
      return { posts: [], hasMore: false, favoriteMap: {} };
    }
  });
}
