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

/**
 * v4 재감사 PERF-07 — 조회 상한(`resolveHomeFeedProductFetchCap`)은 전체 기준이라 한 매장이 상한을 넘게 채울 수 있다.
 * 정렬(추천 → 정렬순서) 결과를 받아 **매장별 앞쪽 `perStore` 개만** 남긴다 (입력 순서 유지).
 * 노출 판정(검수·숨김 구역)을 통과한 행에 적용해 선반·카탈로그가 매장당 20 개를 넘지 않게 한다.
 */
export function capHomeFeedProductsPerStore<T extends { store_id: string }>(
  rows: readonly T[],
  perStore: number = HOME_FEED_PRODUCTS_PER_STORE_FETCH_CAP
): T[] {
  const limit = Math.max(0, Math.floor(Number(perStore) || 0));
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const row of rows) {
    const key = String(row.store_id ?? "");
    const n = counts.get(key) ?? 0;
    if (n >= limit) continue;
    counts.set(key, n + 1);
    out.push(row);
  }
  return out;
}
