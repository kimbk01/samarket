"use client";

import { pruneByExpiresAtAndMaxSize } from "@/lib/http/memory-map-prune";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { recordAppWidePhaseLastMs, samarketRuntimeDebugEnabled } from "@/lib/runtime/samarket-runtime-debug";
import type { PostWithMeta } from "./schema";

export type HomePostSort = "latest" | "popular";
export type HomeTradeStateFilter = "latest" | "active" | "reserved" | "sold";

export interface GetPostsForHomeOptions {
  page?: number;
  sort?: HomePostSort;
  /** 타입 필터. null/미지정 시 전체 등록 상품 조회 */
  type?: "trade" | "community" | "service" | "feature" | null;
  /**
   * 거래 1차 메뉴(중고거래·부동산 등) UUID — 서버에서 하위 카테고리까지 펼쳐 필터.
   * 미지정이면 `/home` 전체 피드.
   */
  tradeMarketParentId?: string | null;
  /** `/home` 전체 거래 정렬/상태 필터 */
  tradeState?: HomeTradeStateFilter;
}

export interface GetPostsForHomeResult {
  posts: PostWithMeta[];
  hasMore: boolean;
  favoriteMap: Record<string, boolean>;
}

const HOME_POSTS_TTL_MS = 45_000;
const HOME_POSTS_SESSION_CACHE_KEY_PREFIX = "samarket:home-posts:v1:";

type HomePostsCacheEntry = {
  data: GetPostsForHomeResult;
  expiresAt: number;
};

const homePostsCache = new Map<string, HomePostsCacheEntry>();
const HOME_CLIENT_POSTS_CACHE_MAX_KEYS = 80;

function capHomePostsClientCache(): void {
  pruneByExpiresAtAndMaxSize(homePostsCache, Date.now(), HOME_CLIENT_POSTS_CACHE_MAX_KEYS);
}

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function makeSessionCacheKey(cacheKey: string): string {
  return `${HOME_POSTS_SESSION_CACHE_KEY_PREFIX}${cacheKey}`;
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
    if (!parsed || typeof parsed.expiresAt !== "number" || !parsed.data) return null;
    if (parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(makeSessionCacheKey(cacheKey));
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

function normalizeOptions(options: GetPostsForHomeOptions = {}) {
  const page = Math.max(1, options.page ?? 1);
  const sort = options.sort ?? "latest";
  const typeFilter = options.type ?? null;
  const tradeMarketParent = options.tradeMarketParentId?.trim() || null;
  const tradeState = options.tradeState ?? "latest";
  /** 서버 정책 A(구성된 거래 루트 합집합)와 캐시 일치 — 키 버전 올리면 브라우저 구 캐시 무효 */
  const marketKey = tradeMarketParent ?? "all";
  const cacheKey = `${page}:${sort}:${typeFilter ?? "all"}:m:${marketKey}:ts:${tradeState}:v4`;
  return { page, sort, typeFilter, tradeMarketParent, tradeState, cacheKey };
}

export function peekCachedPostsForHome(
  options: GetPostsForHomeOptions = {}
): GetPostsForHomeResult | null {
  const { cacheKey } = normalizeOptions(options);
  const cached = homePostsCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    homePostsCache.delete(cacheKey);
  } else {
    return cached.data;
  }
  const sessionHit = readHomePostsSessionCache(cacheKey);
  if (!sessionHit) return null;
  homePostsCache.set(cacheKey, {
    data: sessionHit,
    expiresAt: Date.now() + HOME_POSTS_TTL_MS,
  });
  capHomePostsClientCache();
  return sessionHit;
}

/**
 * 정확 키 캐시 미스 시에도 최근 성공 목록을 즉시 보여주기 위한 fallback.
 * - 만료되지 않은 항목 중 가장 최근 항목을 선택
 * - 빈 목록은 제외(빈값 깜빡임 방지)
 */
export function peekRecentHomePostsFallback(): GetPostsForHomeResult | null {
  const now = Date.now();
  let latest: { at: number; data: GetPostsForHomeResult } | null = null;
  for (const entry of homePostsCache.values()) {
    if (entry.expiresAt <= now) continue;
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
}

/**
 * 홈/물건 등록 리스트용 게시글 조회 (어드민 posts와 동일 테이블)
 * - status: hidden 제외, sold(거래완료)는 홈 목록 미노출
 */
export async function getPostsForHome(
  options: GetPostsForHomeOptions = {},
  opts: { signal?: AbortSignal } = {}
): Promise<GetPostsForHomeResult> {
  const { page, sort, typeFilter, tradeMarketParent, tradeState, cacheKey } = normalizeOptions(options);
  const cached = homePostsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  if (opts.signal) {
    try {
      const params = new URLSearchParams({
        page: String(page),
        sort,
      });
      if (typeFilter) {
        params.set("type", typeFilter);
      }
      if (tradeMarketParent) {
        params.set("tradeMarketParent", tradeMarketParent);
      }
      if (tradeState && tradeState !== "latest") {
        params.set("tradeState", tradeState);
      }

      const dbg = samarketRuntimeDebugEnabled();
      const wallT0 = dbg ? performance.now() : 0;
      const tNet0 = dbg ? performance.now() : 0;
      const res = await fetch(`/api/home/posts?${params.toString()}`, {
        credentials: "include",
        signal: opts.signal,
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
      }
      const tBuild0 = dbg ? performance.now() : 0;
      const result = {
        posts: Array.isArray(data.posts) ? data.posts : [],
        hasMore: data.hasMore === true,
        favoriteMap: data.favoriteMap && typeof data.favoriteMap === "object" ? data.favoriteMap : {},
      };
      homePostsCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + HOME_POSTS_TTL_MS,
      });
      capHomePostsClientCache();
      writeHomePostsSessionCache(cacheKey, result);
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
    const again = homePostsCache.get(cacheKey);
    if (again && again.expiresAt > Date.now()) {
      return again.data;
    }

    try {
      const params = new URLSearchParams({
        page: String(page),
        sort,
      });
      if (typeFilter) {
        params.set("type", typeFilter);
      }
      if (tradeMarketParent) {
        params.set("tradeMarketParent", tradeMarketParent);
      }
      if (tradeState && tradeState !== "latest") {
        params.set("tradeState", tradeState);
      }

      const dbg = samarketRuntimeDebugEnabled();
      const wallT0 = dbg ? performance.now() : 0;
      const tNet0 = dbg ? performance.now() : 0;
      const res = await fetch(`/api/home/posts?${params.toString()}`, {
        credentials: "include",
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
      }
      const tBuild0 = dbg ? performance.now() : 0;
      const result = {
        posts: Array.isArray(data.posts) ? data.posts : [],
        hasMore: data.hasMore === true,
        favoriteMap: data.favoriteMap && typeof data.favoriteMap === "object" ? data.favoriteMap : {},
      };
      homePostsCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + HOME_POSTS_TTL_MS,
      });
      capHomePostsClientCache();
      writeHomePostsSessionCache(cacheKey, result);
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
