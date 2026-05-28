"use client";

import type { AppLanguageCode } from "@/lib/i18n/config";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { fetchStoresHomeFeedDeduped } from "@/lib/stores/store-delivery-api-client";
import type { StoresHomeClientCallSource } from "@/lib/stores/stores-home-network-guards";
import { resolveStoresHomePrewarmLanguage } from "@/lib/stores/stores-home-network-guards";

const STORE_HOME_FEED_TTL_MS = 10 * 60 * 1000;

export type StoreHomeFeedCacheEntry = {
  stores: StoreHomeFeedItem[];
  meta: { source?: string } | null;
  expiresAt: number;
};

export type StoreHomeFeedCacheSnapshot = {
  entry: StoreHomeFeedCacheEntry | null;
  isFresh: boolean;
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
  if (hit.expiresAt <= Date.now()) return null;
  return hit;
}

/**
 * 홈 재진입 체감 안정화: TTL이 지난 스냅샷도 즉시 렌더 폴백으로 사용할 수 있게 제공.
 * 네트워크 재검증(fetch)은 호출부에서 계속 수행하며, 이 함수는 snapshot만 반환한다.
 */
export function readStoreHomeFeedClientCache(pathAndQuery: string): StoreHomeFeedCacheSnapshot {
  const key = normalizeSuffix(pathAndQuery);
  const hit = storeHomeFeedCache.get(key) ?? null;
  if (!hit) return { entry: null, isFresh: false };
  return { entry: hit, isFresh: hit.expiresAt > Date.now() };
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

/** PTR·강제 새로고침 — TTL 스킵 후 네트워크 재검증 */
export function invalidateStoreHomeFeedClientCache(pathAndQuery = ""): void {
  storeHomeFeedCache.delete(normalizeSuffix(pathAndQuery));
}

export type PrewarmStoreHomeFeedClientCacheOptions = {
  language?: AppLanguageCode | string;
  clientCallSource?: StoresHomeClientCallSource;
};

/** 하단 탭·홈 route prewarm — mount 와 동일 language single-flight 파티션 */
export async function prewarmStoreHomeFeedClientCache(
  pathAndQuery = "",
  opts: PrewarmStoreHomeFeedClientCacheOptions = {}
): Promise<void> {
  if (typeof window === "undefined") return;
  const key = normalizeSuffix(pathAndQuery);
  if (peekStoreHomeFeedClientCache(key)) return;
  const language = resolveStoresHomePrewarmLanguage(opts.language);
  const { json } = await fetchStoresHomeFeedDeduped(key, {
    language,
    clientCallSource: opts.clientCallSource ?? "stores_home_prewarm",
  });
  if (!json || typeof json !== "object") return;
  const parsed = json as { ok?: boolean; stores?: StoreHomeFeedItem[]; meta?: { source?: string } };
  if (!parsed.ok || !Array.isArray(parsed.stores)) return;
  primeStoreHomeFeedClientCache(key, { stores: parsed.stores, meta: parsed.meta ?? null });
}
