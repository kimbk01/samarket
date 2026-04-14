"use client";

import type { PostWithMeta } from "./schema";
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type PostSort = "latest" | "popular";

export interface GetPostsByCategoryOptions {
  page?: number;
  sort?: PostSort;
  /** 알바 카테고리 전용: 구인/구직 메타 필터(페이지마다 DB를 여러 번 읽을 수 있음) */
  jobsListingKind?: JobListingKindFilter;
  /**
   * 마켓 루트 UUID — 지정 시 `categoryIds` 대신 서버에서 트리 펼침 (`/api/home/posts` 의 tradeMarketParent 와 동일)
   */
  tradeMarketParent?: string;
  /** `tradeMarketParent` 와 함께: `?topic=` 주제 칩 */
  topic?: string;
}

export interface GetPostsByCategoryResult {
  posts: PostWithMeta[];
  hasMore: boolean;
}

const TRADE_FEED_CLIENT_TTL_MS = 45_000;

type TradeFeedCacheEntry = {
  data: GetPostsByCategoryResult;
  expiresAt: number;
};

const tradeFeedClientCache = new Map<string, TradeFeedCacheEntry>();

/** `/api/trade/feed` 요청 키 — 홈 `getPostsForHome` 캐시 키와 동일한 의도(짧은 TTL·중복 왕복 감소) */
function buildTradeFeedClientCacheKey(
  categoryIds: string[],
  options: GetPostsByCategoryOptions
): string {
  const page = Math.max(1, options.page ?? 1);
  const sort = options.sort ?? "latest";
  const parent = options.tradeMarketParent?.trim();
  if (parent) {
    const topic = (options.topic ?? "").trim().normalize("NFC");
    const jk =
      options.jobsListingKind === "hire" || options.jobsListingKind === "work"
        ? options.jobsListingKind
        : "";
    return `mp:${parent}|t:${topic}|${sort}|jk:${jk}|p:${page}:v1`;
  }
  const ids = [...new Set(categoryIds.map((x) => x.trim()).filter(Boolean))].sort();
  const jk =
    options.jobsListingKind === "hire" || options.jobsListingKind === "work"
      ? options.jobsListingKind
      : "";
  return `ids:${ids.join(",")}|${sort}|jk:${jk}|p:${page}:v1`;
}

/** RSC bootstrap 과 클라이언트 캐시 키 정렬 — 재진입·탭 복귀 시 동일 파라미터 재요청 완화 */
export function peekCachedTradeFeed(
  categoryIds: string[],
  options: GetPostsByCategoryOptions = {}
): GetPostsByCategoryResult | null {
  const key = buildTradeFeedClientCacheKey(categoryIds, options);
  const hit = tradeFeedClientCache.get(key);
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.data;
}

export function primeTradeFeedCache(
  categoryIds: string[],
  options: GetPostsByCategoryOptions,
  data: GetPostsByCategoryResult
): void {
  const key = buildTradeFeedClientCacheKey(categoryIds, options);
  tradeFeedClientCache.set(key, {
    data,
    expiresAt: Date.now() + TRADE_FEED_CLIENT_TTL_MS,
  });
}

/** trade_category_id / category_id 중 하나로 여러 카테고리 OR 조회 */
export async function getPostsByTradeCategoryIds(
  categoryIds: string[],
  options: GetPostsByCategoryOptions = {}
): Promise<GetPostsByCategoryResult> {
  const cacheKey = buildTradeFeedClientCacheKey(categoryIds, options);
  const hit = tradeFeedClientCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.data;
  }

  return runSingleFlight(`trade-feed-fetch:${cacheKey}`, async () => {
    const again = tradeFeedClientCache.get(cacheKey);
    if (again && again.expiresAt > Date.now()) {
      return again.data;
    }

    const params = new URLSearchParams();
    const parent = options.tradeMarketParent?.trim();
    if (parent) {
      params.set("tradeMarketParent", parent);
      const topic = (options.topic ?? "").trim().normalize("NFC");
      if (topic) params.set("topic", topic);
    } else {
      const ids = [...new Set(categoryIds.map((x) => x.trim()).filter(Boolean))];
      if (ids.length === 0) {
        const empty: GetPostsByCategoryResult = { posts: [], hasMore: false };
        return empty;
      }
      params.set("categoryIds", ids.join(","));
    }
    params.set("page", String(Math.max(1, options.page ?? 1)));
    params.set("sort", options.sort ?? "latest");
    if (options.jobsListingKind === "hire" || options.jobsListingKind === "work") {
      params.set("jk", options.jobsListingKind);
    }

    try {
      const res = await fetch(`/api/trade/feed?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        const empty: GetPostsByCategoryResult = { posts: [], hasMore: false };
        return empty;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        posts?: PostWithMeta[];
        hasMore?: boolean;
      };
      if (!data.ok) {
        const empty: GetPostsByCategoryResult = { posts: [], hasMore: false };
        return empty;
      }
      const result: GetPostsByCategoryResult = {
        posts: Array.isArray(data.posts) ? data.posts : [],
        hasMore: data.hasMore === true,
      };
      tradeFeedClientCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + TRADE_FEED_CLIENT_TTL_MS,
      });
      return result;
    } catch {
      const empty: GetPostsByCategoryResult = { posts: [], hasMore: false };
      return empty;
    }
  });
}

export async function getPostsByCategory(
  categoryId: string,
  options: GetPostsByCategoryOptions = {}
): Promise<GetPostsByCategoryResult> {
  if (!categoryId?.trim()) return { posts: [], hasMore: false };
  return getPostsByTradeCategoryIds([categoryId.trim()], options);
}
