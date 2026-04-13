"use client";

import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { PostWithMeta } from "./schema";

export type HomePostSort = "latest" | "popular";

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
}

export interface GetPostsForHomeResult {
  posts: PostWithMeta[];
  hasMore: boolean;
  favoriteMap: Record<string, boolean>;
}

const HOME_POSTS_TTL_MS = 45_000;

type HomePostsCacheEntry = {
  data: GetPostsForHomeResult;
  expiresAt: number;
};

const homePostsCache = new Map<string, HomePostsCacheEntry>();

function normalizeOptions(options: GetPostsForHomeOptions = {}) {
  const page = Math.max(1, options.page ?? 1);
  const sort = options.sort ?? "latest";
  const typeFilter = options.type ?? null;
  const tradeMarketParent = options.tradeMarketParentId?.trim() || null;
  /** 서버 정책 A(구성된 거래 루트 합집합)와 캐시 일치 — 키 버전 올리면 브라우저 구 캐시 무효 */
  const marketKey = tradeMarketParent ?? "all";
  const cacheKey = `${page}:${sort}:${typeFilter ?? "all"}:m:${marketKey}:v3`;
  return { page, sort, typeFilter, tradeMarketParent, cacheKey };
}

export function peekCachedPostsForHome(
  options: GetPostsForHomeOptions = {}
): GetPostsForHomeResult | null {
  const { cacheKey } = normalizeOptions(options);
  const cached = homePostsCache.get(cacheKey);
  if (!cached || cached.expiresAt <= Date.now()) {
    return null;
  }
  return cached.data;
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
}

/**
 * 홈/물건 등록 리스트용 게시글 조회 (어드민 posts와 동일 테이블)
 * - status: hidden 제외, sold(거래완료)는 홈 목록 미노출
 */
export async function getPostsForHome(
  options: GetPostsForHomeOptions = {}
): Promise<GetPostsForHomeResult> {
  const { page, sort, typeFilter, tradeMarketParent, cacheKey } = normalizeOptions(options);
  const cached = homePostsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
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

      const res = await fetch(`/api/home/posts?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        return { posts: [], hasMore: false, favoriteMap: {} };
      }

      const data = (await res.json()) as {
        posts?: PostWithMeta[];
        hasMore?: boolean;
        favoriteMap?: Record<string, boolean>;
      };
      const result = {
        posts: Array.isArray(data.posts) ? data.posts : [],
        hasMore: data.hasMore === true,
        favoriteMap: data.favoriteMap && typeof data.favoriteMap === "object" ? data.favoriteMap : {},
      };
      homePostsCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + HOME_POSTS_TTL_MS,
      });
      return result;
    } catch {
      return { posts: [], hasMore: false, favoriteMap: {} };
    }
  });
}
