/**
 * 배달 매장 상세 클라 캐시 TTL — `store-delivery-api-client` 캐시와 prewarm 「시작」 기록 만료의 단일 정의.
 * v4 W3 PERF-04 — prewarm 시작 Set 이 영구 보존돼 캐시 만료 후 재prewarm 이 막히던 불일치 해소.
 */
export const STORE_SUMMARY_PUBLIC_CACHE_TTL_MS = 15_000;
export const STORE_MENUS_PUBLIC_CACHE_TTL_MS = 15_000;
export const STORE_BANNERS_PUBLIC_CACHE_TTL_MS = 12_000;
