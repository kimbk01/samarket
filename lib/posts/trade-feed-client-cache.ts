/**
 * 브라우저 메모리 trade 피드 캐시 — `GET /api/trade/feed` 왕복 완화.
 * `use client` 없음: `toggleFavorite` 등에서 가볍게 무효화만 import 가능.
 */
import type { PostWithMeta } from "@/lib/posts/schema";
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";

export type TradeFeedClientSort = "latest" | "popular";

export type TradeFeedClientOptions = {
  page?: number;
  sort?: TradeFeedClientSort;
  jobsListingKind?: JobListingKindFilter;
  tradeMarketParent?: string;
  topic?: string;
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
  const parent = options.tradeMarketParent?.trim();
  if (parent) {
    const topic = (options.topic ?? "").trim().normalize("NFC");
    const jk =
      options.jobsListingKind === "hire" || options.jobsListingKind === "work"
        ? options.jobsListingKind
        : "";
    return `mp:${parent}|t:${topic}|${sort}|jk:${jk}|p:${page}|u:${u}:v2`;
  }
  const ids = [...new Set(categoryIds.map((x) => x.trim()).filter(Boolean))].sort();
  const jk =
    options.jobsListingKind === "hire" || options.jobsListingKind === "work"
      ? options.jobsListingKind
      : "";
  return `ids:${ids.join(",")}|${sort}|jk:${jk}|p:${page}|u:${u}:v2`;
}

/** 찜 토글 성공 후 — 서버 무효화와 맞춰 뷰어별 엔트리 제거 */
export function invalidateTradeFeedClientCacheForViewer(viewerUserId: string): void {
  const u = viewerUserId.trim();
  if (!u) return;
  const suffix = `|u:${u}:v2`;
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
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.data;
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
}
