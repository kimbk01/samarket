/**
 * v4 PERF-07 — 홈 피드 store_products 조회 상한. 선반이 쓰는 개수(대표 3 + 인기 상위 N)보다 넉넉한 매장당 20,
 * 전체 1000(PostgREST 기본 max rows — 상한 없이도 잘리던 값)을 넘지 않는다.
 */
export const HOME_FEED_PRODUCTS_PER_STORE_FETCH_CAP = 20;
export const HOME_FEED_PRODUCTS_FETCH_CAP_MAX = 1000;

export function resolveHomeFeedProductFetchCap(storeCount: number): number {
  const n = Math.max(1, Math.floor(Number(storeCount) || 0));
  return Math.min(HOME_FEED_PRODUCTS_FETCH_CAP_MAX, n * HOME_FEED_PRODUCTS_PER_STORE_FETCH_CAP);
}
