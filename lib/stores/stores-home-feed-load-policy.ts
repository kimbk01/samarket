import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  primeStoreHomeFeedClientCache,
  readStoreHomeFeedClientCache,
  type StoreHomeFeedCacheSnapshot,
} from "@/lib/stores/store-home-feed-client-cache";
import {
  readStoresHomeFeedLiveStore,
  writeStoresHomeFeedLiveStore,
} from "@/lib/stores/stores-home-feed-live-store";

export type StoresHomeFeedLoadSnapshot = {
  stores: StoreHomeFeedItem[];
  meta: { source?: string } | null;
  fromCache: boolean;
  isFresh: boolean;
};

/** 쿼리 suffix + 기본(`""`) 폴백 — 재진입·지역 로드 직후에도 즉시 표시 */
export function resolveStoresHomeFeedCacheForLoad(querySuffix: string): StoreHomeFeedCacheSnapshot & {
  entryStores: StoreHomeFeedItem[];
} {
  const primary = readStoreHomeFeedClientCache(querySuffix);
  const fallback = querySuffix ? readStoreHomeFeedClientCache("") : null;
  const entry = primary.entry ?? fallback?.entry ?? null;
  const isFresh = primary.entry ? primary.isFresh : (fallback?.isFresh ?? false);
  return {
    entry,
    isFresh,
    entryStores: entry?.stores ?? [],
  };
}

export function readStoresHomeFeedInitialSnapshot(querySuffix: string): StoresHomeFeedLoadSnapshot {
  const live = readStoresHomeFeedLiveStore();
  if (live) {
    return {
      stores: live.stores,
      meta: live.meta,
      fromCache: true,
      isFresh: false,
    };
  }
  const cached = resolveStoresHomeFeedCacheForLoad(querySuffix);
  return {
    stores: cached.entryStores,
    meta: cached.entry?.meta ?? null,
    fromCache: cached.entryStores.length > 0,
    isFresh: cached.isFresh,
  };
}

/**
 * CUT-B2 — displayable cache for **exact** `querySuffix` only (no root fallback).
 * Used to paint before boot/`feedReady` without opening home-feed network or mutating auth.
 */
export function readStoresHomeFeedExactCacheSnapshot(
  querySuffix: string
): StoresHomeFeedLoadSnapshot | null {
  const live = readStoresHomeFeedLiveStore();
  if (live && live.querySuffix === querySuffix && live.stores.length > 0) {
    return {
      stores: live.stores,
      meta: live.meta,
      fromCache: true,
      isFresh: false,
    };
  }
  const primary = readStoreHomeFeedClientCache(querySuffix);
  if (primary.entry && primary.entry.stores.length > 0) {
    return {
      stores: primary.entry.stores,
      meta: primary.entry.meta,
      fromCache: true,
      isFresh: primary.isFresh,
    };
  }
  return null;
}

type HomeFeedJson = {
  ok?: boolean;
  stores?: StoreHomeFeedItem[];
  meta?: { source?: string };
};

function parseHomeFeedJson(json: unknown): HomeFeedJson | null {
  if (!json || typeof json !== "object") return null;
  return json as HomeFeedJson;
}

/**
 * CONTRACT — 네트워크 실패·abort·일시 500 에도 **마지막 성공 목록 유지**(재접속 빈 화면 방지).
 * DO NOT: catch/!ok 분기에서 `setStores([])` — 캐시·현재 state 폴백만 허용.
 */
export function applyStoresHomeFeedNetworkResult(opts: {
  querySuffix: string;
  status: number;
  json: unknown;
  previousStores: StoreHomeFeedItem[];
  previousMeta: { source?: string } | null;
}): StoresHomeFeedLoadSnapshot {
  const parsed = parseHomeFeedJson(opts.json);
  if (
    opts.status >= 200 &&
    opts.status < 300 &&
    parsed?.ok === true &&
    Array.isArray(parsed.stores)
  ) {
    primeStoreHomeFeedClientCache(opts.querySuffix, {
      stores: parsed.stores,
      meta: parsed.meta ?? null,
    });
    writeStoresHomeFeedLiveStore(opts.querySuffix, parsed.stores, parsed.meta ?? null);
    return {
      stores: parsed.stores,
      meta: parsed.meta ?? null,
      fromCache: false,
      isFresh: true,
    };
  }

  if (opts.previousStores.length > 0) {
    return {
      stores: opts.previousStores,
      meta: opts.previousMeta,
      fromCache: true,
      isFresh: false,
    };
  }

  const cached = resolveStoresHomeFeedCacheForLoad(opts.querySuffix);
  if (cached.entryStores.length > 0) {
    return {
      stores: cached.entryStores,
      meta: cached.entry?.meta ?? null,
      fromCache: true,
      isFresh: cached.isFresh,
    };
  }

  return {
    stores: [],
    meta: opts.previousMeta,
    fromCache: false,
    isFresh: false,
  };
}
