"use client";

import type { PostWithMeta } from "./schema";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  buildTradeFeedClientCacheKey,
  peekCachedTradeFeed as peekCachedTradeFeedRaw,
  primeTradeFeedCache as primeTradeFeedCacheRaw,
  readTradeFeedClientCache,
  writeTradeFeedClientCache,
  type TradeFeedClientOptions,
  type TradeFeedClientResult,
  type TradeFeedClientSort,
} from "@/lib/posts/trade-feed-client-cache";

export type PostSort = TradeFeedClientSort;
export type GetPostsByCategoryOptions = TradeFeedClientOptions;
export type GetPostsByCategoryResult = TradeFeedClientResult;

export function getTradeFeedClientViewerSegment(): string {
  if (typeof window === "undefined") return "anon";
  return getCurrentUser()?.id?.trim() || "anon";
}

function tradeFeedCacheViewerSuffix(): string {
  return getTradeFeedClientViewerSegment();
}

/** RSC bootstrap 과 클라이언트 캐시 키 정렬 — 재진입·탭 복귀 시 동일 파라미터 재요청 완화 */
export function peekCachedTradeFeed(
  categoryIds: string[],
  options: GetPostsByCategoryOptions = {}
): GetPostsByCategoryResult | null {
  return peekCachedTradeFeedRaw(categoryIds, options, tradeFeedCacheViewerSuffix());
}

export function primeTradeFeedCache(
  categoryIds: string[],
  options: GetPostsByCategoryOptions,
  data: GetPostsByCategoryResult
): void {
  primeTradeFeedCacheRaw(categoryIds, options, data, tradeFeedCacheViewerSuffix());
}

/** trade_category_id / category_id 중 하나로 여러 카테고리 OR 조회 */
export async function getPostsByTradeCategoryIds(
  categoryIds: string[],
  options: GetPostsByCategoryOptions = {}
): Promise<GetPostsByCategoryResult> {
  const viewerSeg = tradeFeedCacheViewerSuffix();
  const cacheKey = buildTradeFeedClientCacheKey(categoryIds, options, viewerSeg);
  const hit = readTradeFeedClientCache(categoryIds, options, viewerSeg);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.data;
  }

  return runSingleFlight(`trade-feed-fetch:${cacheKey}`, async () => {
    const again = readTradeFeedClientCache(categoryIds, options, viewerSeg);
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
        favoriteMap?: Record<string, boolean>;
      };
      if (!data.ok) {
        const empty: GetPostsByCategoryResult = { posts: [], hasMore: false };
        return empty;
      }
      const fav =
        data.favoriteMap && typeof data.favoriteMap === "object"
          ? data.favoriteMap
          : undefined;
      const result: GetPostsByCategoryResult = {
        posts: Array.isArray(data.posts) ? data.posts : [],
        hasMore: data.hasMore === true,
        ...(fav ? { favoriteMap: fav } : {}),
      };
      writeTradeFeedClientCache(categoryIds, options, viewerSeg, result);
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
