"use client";

import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

/**
 * 묶음4 F-06 — `/stores` 홈 배너(히어로·나머지 매장 앞) 클라 fetcher.
 *
 * home-feed fetcher 와 같은 계약:
 * - 같은 URL 동시 호출은 single-flight 1건으로 합친다 (마운트·prewarm·재마운트 fan-out 방지).
 * - 성공 응답은 짧은 TTL 메모리 캐시 — 탭 왕복 재진입 시 네트워크 없이 즉시 그린다.
 *   (노출 토큰 TTL 30분 ≫ 캐시 TTL, home-feed `homeInsertions` 토큰 캐시와 같은 성격)
 * - `force` (당겨서 새로고침·주소 변경 = 묶음 2 refreshKey) 는 캐시·진행 중 비행을 버리고 새로 조회.
 * - 주소 변경 브로드캐스트(`clearAllStoreHomeFeedClientCaches`)가 이 캐시도 비운다 — 배너는 보는 사람 주소 기준.
 */
export const STORES_HOME_BANNERS_CLIENT_CACHE_TTL_MS = 30_000;

export type StoresHomeBannerApiPath =
  | "/api/stores/home-hero-banners"
  | "/api/stores/home-before-rest-banners";

export type StoresHomeBannersResponse = {
  ok?: boolean;
  banners?: unknown[];
  physicalEnabled?: boolean;
  meta?: Record<string, unknown>;
};

type CacheEntry = { json: StoresHomeBannersResponse; expiresAt: number };

const bannersCache = new Map<StoresHomeBannerApiPath, CacheEntry>();

function flightKey(path: StoresHomeBannerApiPath): string {
  return `stores:home-banners:${path}`;
}

/** TTL 안 캐시 — 동기 읽기(첫 렌더에서 배너 즉시 페인트). */
export function peekStoresHomeBannersClientCache(
  path: StoresHomeBannerApiPath
): StoresHomeBannersResponse | null {
  const hit = bannersCache.get(path);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    bannersCache.delete(path);
    return null;
  }
  return hit.json;
}

export function clearStoresHomeBannersClientCache(): void {
  bannersCache.clear();
  forgetSingleFlight(flightKey("/api/stores/home-hero-banners"));
  forgetSingleFlight(flightKey("/api/stores/home-before-rest-banners"));
}

export async function fetchStoresHomeBannersDeduped(
  path: StoresHomeBannerApiPath,
  opts?: { force?: boolean }
): Promise<StoresHomeBannersResponse> {
  if (opts?.force) {
    bannersCache.delete(path);
    forgetSingleFlight(flightKey(path));
  } else {
    const cached = peekStoresHomeBannersClientCache(path);
    if (cached) return cached;
  }
  return runSingleFlight(flightKey(path), async () => {
    const res = await fetch(path, { cache: "no-store" });
    const json = ((await res.json().catch(() => null)) ?? {}) as StoresHomeBannersResponse;
    if (res.ok && json.ok !== false) {
      bannersCache.set(path, { json, expiresAt: Date.now() + STORES_HOME_BANNERS_CLIENT_CACHE_TTL_MS });
    } else {
      bannersCache.delete(path);
    }
    return json;
  });
}

/**
 * 홈 진입 prewarm — 히어로·나머지 매장 앞 배너를 **병렬**로 시작한다.
 * before-rest 는 home-feed 응답 뒤 슬롯 마운트 때가 아니라 허브 진입과 동시에 비행을 시작하고,
 * 슬롯이 마운트되면 같은 비행·캐시에 합류한다 (워터폴 제거).
 */
export function prewarmStoresHomeBanners(opts?: { force?: boolean }): void {
  if (typeof window === "undefined") return;
  void fetchStoresHomeBannersDeduped("/api/stores/home-hero-banners", opts).catch(() => {});
  void fetchStoresHomeBannersDeduped("/api/stores/home-before-rest-banners", opts).catch(() => {});
}
