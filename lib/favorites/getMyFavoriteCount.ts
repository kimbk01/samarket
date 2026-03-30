"use client";

import { runSingleFlight } from "@/lib/http/run-single-flight";

const TTL_MS = 12_000;
let cached: { expiresAt: number; value: number } | null = null;

/**
 * 현재 사용자의 찜(관심) 상품 개수 — 서버 API.
 * 짧은 TTL + single-flight 로 마이페이지·헤더 등 동시 호출 시 요청 합침.
 */
export async function getMyFavoriteCount(): Promise<number> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  return runSingleFlight("favorites:count", async () => {
    try {
      const res = await fetch("/api/favorites/count", { credentials: "include" });
      const data = (await res.json()) as { count?: number };
      const n = typeof data.count === "number" ? data.count : 0;
      cached = { value: n, expiresAt: Date.now() + TTL_MS };
      return n;
    } catch {
      return 0;
    }
  });
}

/** 찜 추가/제거 직후 배지·카운트 즉시 맞출 때 */
export function invalidateFavoriteCountClientCache(): void {
  cached = null;
}
