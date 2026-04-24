"use client";

import type { PurchaseHistoryRow } from "@/components/mypage/purchases/PurchaseHistoryCard";
import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";

/** 시트·마이페이지 재진입 시 같은 세션에서 재요청 부담 완화 */
const TRADE_HISTORY_CACHE_TTL_MS = 45_000;
/** 대시보드 배지용 — 전체 목록보다 TTL을 길게 (경량 count_only API) */
const TRADE_COUNTS_CACHE_TTL_MS = 45_000;

type CacheEntry<T> = {
  data?: T;
  updatedAt: number;
  promise?: Promise<T>;
};

const purchaseCache = new Map<string, CacheEntry<PurchaseHistoryRow[]>>();
const salesCache = new Map<string, CacheEntry<SalesHistoryRow[]>>();
const tradeCountsCache = new Map<string, CacheEntry<{ purchaseCount: number; salesCount: number }>>();

/** 쿠키 세션만으로 조회할 때 — `getCurrentUser()`보다 앞서 호출 가능 */
export const TRADE_HISTORY_SESSION_CACHE_KEY = "__session__";

function getCacheKey(userId: string): string {
  return userId.trim();
}

async function loadShared<T>(
  cache: Map<string, CacheEntry<T>>,
  userId: string,
  force: boolean,
  loader: () => Promise<T>
): Promise<T> {
  const key = getCacheKey(userId);
  if (!key) return loader();

  const now = Date.now();
  const existing = cache.get(key);
  if (!force && existing?.promise) {
    return existing.promise;
  }
  if (
    !force &&
    existing &&
    existing.data !== undefined &&
    now - existing.updatedAt < TRADE_HISTORY_CACHE_TTL_MS
  ) {
    return existing.data;
  }

  const promise = loader()
    .then((data) => {
      cache.set(key, { data, updatedAt: Date.now() });
      return data;
    })
    .catch((error) => {
      const stale = cache.get(key)?.data;
      cache.set(key, { data: stale, updatedAt: 0 });
      throw error;
    });

  cache.set(key, {
    data: existing?.data,
    updatedAt: existing?.updatedAt ?? 0,
    promise,
  });

  return promise;
}

export function invalidateTradeHistoryCache(userId?: string): void {
  const key = userId?.trim();
  if (!key) {
    purchaseCache.clear();
    salesCache.clear();
    tradeCountsCache.clear();
    return;
  }
  purchaseCache.delete(key);
  salesCache.delete(key);
  tradeCountsCache.delete(key);
  purchaseCache.delete(TRADE_HISTORY_SESSION_CACHE_KEY);
  salesCache.delete(TRADE_HISTORY_SESSION_CACHE_KEY);
}

/** Align client trade-count cache with RSC hubServerExtras. */
export function primeTradeHistoryCountsCache(
  userId: string,
  data: { purchaseCount: number; salesCount: number }
): void {
  const key = getCacheKey(userId);
  if (!key) return;
  tradeCountsCache.set(key, { data: { ...data }, updatedAt: Date.now() });
}

/**
 * 내정보 대시보드 등 — 구매/판매 「건수」만 필요할 때.
 * `GET /api/my/trade-counts` 한 번으로 구매·판매 건수만 로드 (dev 라우트 이중 컴파일 방지).
 */
export async function fetchTradeHistoryCounts(
  userId: string,
  opts?: { force?: boolean }
): Promise<{ purchaseCount: number; salesCount: number }> {
  const key = getCacheKey(userId);
  if (!key) {
    return { purchaseCount: 0, salesCount: 0 };
  }

  const now = Date.now();
  const existing = tradeCountsCache.get(key);
  if (!opts?.force && existing?.promise) {
    return existing.promise;
  }
  if (
    !opts?.force &&
    existing &&
    existing.data !== undefined &&
    now - existing.updatedAt < TRADE_COUNTS_CACHE_TTL_MS
  ) {
    return existing.data;
  }

  const promise = (async () => {
    const res = await fetch("/api/my/trade-counts", {
      cache: "no-store",
      credentials: "include",
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      purchaseCount?: unknown;
      salesCount?: unknown;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(
        typeof j.error === "string" ? j.error : "거래 건수를 불러오지 못했어요."
      );
    }
    if (j.ok !== true) {
      throw new Error(typeof j.error === "string" ? j.error : "거래 건수를 불러오지 못했어요.");
    }
    const purchaseCount = Math.max(0, Math.floor(Number(j.purchaseCount) || 0));
    const salesCount = Math.max(0, Math.floor(Number(j.salesCount) || 0));
    const data = { purchaseCount, salesCount };
    tradeCountsCache.set(key, { data, updatedAt: Date.now() });
    return data;
  })().catch((error) => {
    const stale = tradeCountsCache.get(key)?.data;
    tradeCountsCache.set(key, { data: stale, updatedAt: 0 });
    throw error;
  });

  tradeCountsCache.set(key, {
    data: existing?.data,
    updatedAt: existing?.updatedAt ?? 0,
    promise,
  });

  return promise;
}

async function fetchPurchasesPayload(): Promise<PurchaseHistoryRow[]> {
  const response = await fetch("/api/my/purchases", {
    cache: "no-store",
    credentials: "include",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    items?: PurchaseHistoryRow[];
    error?: string;
  };
  if (response.status === 401) {
    return [];
  }
  if (!response.ok) {
    throw new Error(payload.error || "구매 내역을 불러오지 못했어요.");
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.map((item) => ({
    ...item,
    hasBuyerReview: !!item.hasBuyerReview,
  }));
}

/**
 * 세션 쿠키만으로 구매 내역 — 클라 프로필 캐시가 아직 없을 때도 즉시 요청·캐시 공유(프리페치와 동일 키).
 */
export async function fetchTradeHistoryPurchasesBySession(opts?: {
  force?: boolean;
}): Promise<PurchaseHistoryRow[]> {
  return loadShared(
    purchaseCache,
    TRADE_HISTORY_SESSION_CACHE_KEY,
    !!opts?.force,
    fetchPurchasesPayload
  );
}

export async function fetchTradeHistoryPurchases(
  userId: string,
  opts?: { force?: boolean }
): Promise<PurchaseHistoryRow[]> {
  return loadShared(purchaseCache, userId, !!opts?.force, fetchPurchasesPayload);
}

async function fetchSalesPayload(): Promise<SalesHistoryRow[]> {
  const response = await fetch("/api/my/sales", {
    cache: "no-store",
    credentials: "include",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    items?: SalesHistoryRow[];
    error?: string;
  };
  if (response.status === 401) {
    return [];
  }
  if (!response.ok) {
    throw new Error(payload.error || "판매 내역을 불러오지 못했어요.");
  }
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function fetchTradeHistorySalesBySession(opts?: {
  force?: boolean;
}): Promise<SalesHistoryRow[]> {
  return loadShared(
    salesCache,
    TRADE_HISTORY_SESSION_CACHE_KEY,
    !!opts?.force,
    fetchSalesPayload
  );
}

/** 구매·판매 API를 병렬로 백그라운드 프리페치 — 허브 스택·`+` 메뉴 열릴 때 체감 지연 완화 */
export function prefetchTradeHubHistorySnapshots(): void {
  void fetchTradeHistoryPurchasesBySession().catch(() => {});
  void fetchTradeHistorySalesBySession().catch(() => {});
}

export async function fetchTradeHistorySales(
  userId: string,
  opts?: { force?: boolean }
): Promise<SalesHistoryRow[]> {
  return loadShared(salesCache, userId, !!opts?.force, fetchSalesPayload);
}
