"use client";

import { forgetSingleFlightsWhere, runSingleFlight } from "@/lib/http/run-single-flight";
import type { PhysicalBannerResolvedSlide } from "@/lib/stores/load-delivery-ad-physical-banners";

/**
 * v4 W3 PERF-14 — 업종(browse) 상단 배너 `GET /api/stores/browse-top-banners` 클라 fetcher.
 * 홈 배너 fetcher(`stores-home-banners-client`)와 같은 계약:
 * - 같은 URL 동시 호출은 single-flight 1건 (업종·칩 왕복·재마운트 fan-out 방지).
 * - 성공 응답은 짧은 TTL 메모리 캐시 — 칩 왕복 재진입 시 네트워크 없이 즉시 그린다.
 * - 주소 변경·데이터 리셋(`clearAllStoreHomeFeedClientCaches`) 때 함께 비운다.
 */
export const STORES_BROWSE_TOP_BANNERS_CLIENT_CACHE_TTL_MS = 30_000;

export type StoresBrowseTopBannersResponse = {
  ok?: boolean;
  banners?: PhysicalBannerResolvedSlide[];
  physicalEnabled?: boolean;
  meta?: { viewer_gate?: string } | null;
};

type CacheEntry = { json: StoresBrowseTopBannersResponse; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const FLIGHT_PREFIX = "stores:browse-top-banners:";

export function buildStoresBrowseTopBannersPath(primarySlug: string, subSlug: string | null): string {
  const qs = new URLSearchParams({ primary: primarySlug });
  if (subSlug) qs.set("sub", subSlug);
  return `/api/stores/browse-top-banners?${qs.toString()}`;
}

export function peekStoresBrowseTopBannersClientCache(path: string): StoresBrowseTopBannersResponse | null {
  const hit = cache.get(path);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(path);
    return null;
  }
  return hit.json;
}

export function clearStoresBrowseTopBannersClientCache(): void {
  cache.clear();
  forgetSingleFlightsWhere((key) => key.startsWith(FLIGHT_PREFIX));
}

export async function fetchStoresBrowseTopBannersDeduped(
  path: string,
  opts?: { force?: boolean }
): Promise<StoresBrowseTopBannersResponse> {
  const key = `${FLIGHT_PREFIX}${path}`;
  if (opts?.force) {
    cache.delete(path);
    forgetSingleFlightsWhere((k) => k === key);
  } else {
    const cached = peekStoresBrowseTopBannersClientCache(path);
    if (cached) return cached;
  }
  return runSingleFlight(key, async () => {
    const res = await fetch(path, { cache: "no-store" });
    const json = ((await res.json().catch(() => null)) ?? {}) as StoresBrowseTopBannersResponse;
    /** 열람 게이트 차단 응답(비로그인·주소 없음)은 캐시하지 않는다 — 로그인·주소 등록 직후 바로 반영 */
    const gate = json.meta?.viewer_gate;
    const gateBlocked = typeof gate === "string" && gate !== "ok";
    if (res.ok && json.ok !== false && !gateBlocked) {
      cache.set(path, { json, expiresAt: Date.now() + STORES_BROWSE_TOP_BANNERS_CLIENT_CACHE_TTL_MS });
    } else {
      cache.delete(path);
    }
    return json;
  });
}
