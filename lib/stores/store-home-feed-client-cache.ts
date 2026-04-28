"use client";

import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { fetchStoresHomeFeedDeduped } from "@/lib/stores/store-delivery-api-client";

const STORE_HOME_FEED_TTL_MS = 30_000;

export type StoreHomeFeedCacheEntry = {
  stores: StoreHomeFeedItem[];
  meta: { source?: string } | null;
  expiresAt: number;
};

const storeHomeFeedCache = new Map<string, StoreHomeFeedCacheEntry>();

function normalizeSuffix(pathAndQuery: string): string {
  if (!pathAndQuery) return "";
  return pathAndQuery.startsWith("?") ? pathAndQuery : `?${pathAndQuery}`;
}

export function peekStoreHomeFeedClientCache(pathAndQuery: string): StoreHomeFeedCacheEntry | null {
  const key = normalizeSuffix(pathAndQuery);
  const hit = storeHomeFeedCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    storeHomeFeedCache.delete(key);
    return null;
  }
  return hit;
}

export function primeStoreHomeFeedClientCache(
  pathAndQuery: string,
  value: { stores: StoreHomeFeedItem[]; meta: { source?: string } | null }
): void {
  const key = normalizeSuffix(pathAndQuery);
  storeHomeFeedCache.set(key, {
    stores: value.stores,
    meta: value.meta,
    expiresAt: Date.now() + STORE_HOME_FEED_TTL_MS,
  });
}

/** 하단 탭 prewarm: stores 홈 기본 피드(쿼리 없는 기본 suffix) */
export async function prewarmStoreHomeFeedClientCache(pathAndQuery = ""): Promise<void> {
  if (typeof window === "undefined") return;
  const key = normalizeSuffix(pathAndQuery);
  if (peekStoreHomeFeedClientCache(key)) return;
  const { json } = await fetchStoresHomeFeedDeduped(key);
  if (!json || typeof json !== "object") return;
  const parsed = json as { ok?: boolean; stores?: StoreHomeFeedItem[]; meta?: { source?: string } };
  if (!parsed.ok || !Array.isArray(parsed.stores)) return;
  primeStoreHomeFeedClientCache(key, { stores: parsed.stores, meta: parsed.meta ?? null });
}
