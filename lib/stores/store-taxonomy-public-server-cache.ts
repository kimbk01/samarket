/**
 * v4 PERF-15 — `GET /api/stores/taxonomy` 성공 본문의 인스턴스 메모리 캐시 (요청자 무관 마스터 데이터).
 *
 * - 키 1개(활성 업종 1·2·3차 + 업종 노출 정책 부가). 사용자·언어·좌표를 담지 않는다.
 * - 관리자 업종·업종 정책 쓰기는 `bumpStorePublicSharedCacheGeneration` → 세대 변경 시
 *   `purgeAllStorePublicServerMemoryCaches` 가 이 캐시도 비운다 (인스턴스 공통 ≤ 2s).
 * - TTL 은 세대 동기화 실패 시의 상한. 오류·테이블 부재 본문은 저장하지 않는다.
 * - 동시 미스는 single-flight 로 1회 조회.
 */
export const STORE_TAXONOMY_PUBLIC_SERVER_CACHE_TTL_MS = 60_000;

type Entry<T> = { expiresAt: number; body: T };

let entry: Entry<unknown> | null = null;
let inflight: Promise<unknown> | null = null;

export function peekStoreTaxonomyPublicServerCache<T>(): T | null {
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    entry = null;
    return null;
  }
  return entry.body as T;
}

export function setStoreTaxonomyPublicServerCache<T>(body: T): void {
  entry = { expiresAt: Date.now() + STORE_TAXONOMY_PUBLIC_SERVER_CACHE_TTL_MS, body };
}

/** 캐시 미스 시 loader 를 1회만 실행 (동시 요청 합류). loader 가 null 을 주면 저장하지 않는다. */
export async function loadStoreTaxonomyPublicWithCache<T>(loader: () => Promise<T | null>): Promise<T | null> {
  const hit = peekStoreTaxonomyPublicServerCache<T>();
  if (hit) return hit;
  if (inflight) return (await inflight) as T | null;
  const flight = (async () => {
    const body = await loader();
    if (body != null) setStoreTaxonomyPublicServerCache(body);
    return body;
  })();
  inflight = flight;
  try {
    return await flight;
  } finally {
    if (inflight === flight) inflight = null;
  }
}

/** DEF-64 세대 purge 등록 — `purgeAllStorePublicServerMemoryCaches` */
export function clearStoreTaxonomyPublicServerCache(): void {
  entry = null;
}
