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

import type { StoresHomeCompositionPolicyMeta } from "@/lib/stores/composition/stores-composition-live";
import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";

export type StoresHomeFeedLoadMeta = {
  source?: string;
  compositionPolicy?: StoresHomeCompositionPolicyMeta;
  compositionEngine?: "live";
  homeInsertions?: StoresHomeInsertionMeta;
  discoveryCampaigns?: { status?: string };
};

export type StoresHomeFeedLoadSnapshot = {
  stores: StoreHomeFeedItem[];
  meta: StoresHomeFeedLoadMeta | null;
  fromCache: boolean;
  isFresh: boolean;
};

type HomeFeedJson = {
  ok?: boolean;
  stores?: StoreHomeFeedItem[];
  meta?: StoresHomeFeedLoadMeta;
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

function parseHomeFeedJson(json: unknown): HomeFeedJson | null {
  if (!json || typeof json !== "object") return null;
  return json as HomeFeedJson;
}

/**
 * CONTRACT — 네트워크 실패·abort·일시 500 에도 **마지막 성공 목록 유지**(재접속 빈 화면 방지).
 * DO NOT: catch/!ok 분기에서 `setStores([])` — 캐시·현재 state 폴백만 허용.
 */
/** home-feed 네트워크 응답이 신규 목록으로 커밋 가능한 성공인지 — PTR 결과 판정과 공유 */
export function isStoresHomeFeedNetworkSuccess(status: number, json: unknown): boolean {
  const parsed = parseHomeFeedJson(json);
  return status >= 200 && status < 300 && parsed?.ok === true && Array.isArray(parsed.stores);
}

/**
 * DSC-02 — fresh 캐시 페인트 후 백그라운드 재검증 결과의 매장 행이 화면과 다른지.
 * 같으면 행 교체 생략(하이드레이션·composition 재계산 방지). 1회/마운트라 직렬화 비교로 충분.
 */
export function storesHomeFeedRevalidatedStoresChanged(
  current: StoreHomeFeedItem[],
  next: StoreHomeFeedItem[]
): boolean {
  if (current === next) return false;
  if (current.length !== next.length) return true;
  return JSON.stringify(current) !== JSON.stringify(next);
}

export function applyStoresHomeFeedNetworkResult(opts: {
  querySuffix: string;
  status: number;
  json: unknown;
  previousStores: StoreHomeFeedItem[];
  previousMeta: StoresHomeFeedLoadMeta | null;
}): StoresHomeFeedLoadSnapshot {
  const parsed = parseHomeFeedJson(opts.json);
  if (parsed && isStoresHomeFeedNetworkSuccess(opts.status, opts.json) && Array.isArray(parsed.stores)) {
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
