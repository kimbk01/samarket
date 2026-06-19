"use client";

import { runSingleFlight } from "@/lib/http/run-single-flight";

const TTL_MS = 12_000;
let cached: { expiresAt: number; value: { total: number; trade: number; store: number } } | null = null;

export type MyFavoriteCounts = {
  total: number;
  trade: number;
  store: number;
};

/**
 * 거래·스토어 찜 합산 — `/api/favorites/count` (쿠키 세션, getCurrentUser 게이트 없음)
 */
export async function getMyFavoriteCounts(): Promise<MyFavoriteCounts> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  try {
    const res = await runSingleFlight("favorites:count", () =>
      fetch("/api/favorites/count", { credentials: "include" })
    );
    const data = (await res.clone().json().catch(() => ({}))) as {
      count?: number;
      trade_count?: number;
      store_count?: number;
    };
    const trade = typeof data.trade_count === "number" ? data.trade_count : 0;
    const store = typeof data.store_count === "number" ? data.store_count : 0;
    const total =
      typeof data.count === "number" ? data.count : trade + store;
    const value = { total, trade, store };
    cached = { value, expiresAt: Date.now() + TTL_MS };
    return value;
  } catch {
    return { total: 0, trade: 0, store: 0 };
  }
}

/** @deprecated — use getMyFavoriteCounts().total */
export async function getMyFavoriteCount(): Promise<number> {
  const c = await getMyFavoriteCounts();
  return c.total;
}

export function invalidateFavoriteCountClientCache(): void {
  cached = null;
}
