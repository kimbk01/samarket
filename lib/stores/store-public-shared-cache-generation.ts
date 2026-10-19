import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { purgeAllStorePublicServerMemoryCaches } from "@/lib/stores/store-public-server-memory-purge";

/**
 * DEF-64 — 매장·상품·쿠폰 관리자 변경의 **인스턴스 공통** 서버 캐시 무효화.
 *
 * 문제: 홈 피드·browse·summary·menus·slug 캐시는 서버리스 인스턴스별 메모리 Map 이라
 * 관리자 API 를 처리한 인스턴스 1개만 비워지고 나머지는 TTL(20~60s)까지 이전 값을 낸다.
 *
 * 구조 (하단 메뉴 `revalidateTag` 방식과 동일한 Next Data Cache tag 사용):
 * - 공용 "세대(generation)" 토큰을 `unstable_cache` + tag 로 Next Data Cache 에 둔다 (DB 접근 없음).
 * - 관리자 쓰기 → `bumpStorePublicSharedCacheGeneration()` → 로컬 즉시 purge +
 *   `revalidateTag(tag, { expire: 0 })` (즉시 만료 — Route Handler 에서는 `updateTag` 사용 불가).
 * - 읽기 라우트 → `syncStorePublicReadCachesWithSharedGeneration()` — 인스턴스당
 *   **최대 SYNC_WINDOW_MS 마다 1회** Data Cache 조회(무DB), 세대가 바뀌었으면 로컬 메모리 캐시 전체 purge.
 *   창 안에서는 메모리 비교만 — 핫패스 추가 DB 왕복 0, 추가 Data Cache 조회는 인스턴스당 ≤ 0.5회/s.
 *
 * 반영 지연(인스턴스 공통): ≤ SYNC_WINDOW_MS(2s) + 세대 재생성 1회 — 기존 TTL 20~60s 대비.
 * DB 스냅샷(browse/menus counter row, discovery projection)은 원래 공용이므로 별도 처리 없음.
 */
export const STORE_PUBLIC_SHARED_CACHE_TAG = "store-public-read-caches";

/** 세대 확인 최소 간격 — 폴링이 아니라 요청이 올 때만 확인하는 상한 */
export const STORE_PUBLIC_SHARED_CACHE_SYNC_WINDOW_MS = 2_000;

function mintGeneration(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 공용 세대 토큰 — tag 만료 전까지 모든 인스턴스가 같은 값을 읽는다.
 * 콜백은 DB 를 읽지 않으며 만료 후 첫 호출 인스턴스가 새 토큰을 기록한다
 * (동시 재생성 경합 시 최대 1회 추가 purge — 정합성 영향 없음).
 */
const readSharedStorePublicCacheGeneration = unstable_cache(
  async (): Promise<string> => mintGeneration(),
  ["store-public-read-caches:generation:v1"],
  { tags: [STORE_PUBLIC_SHARED_CACHE_TAG], revalidate: false }
);

type SyncState = {
  knownGeneration: string | null;
  lastCheckedAt: number;
  inflight: Promise<void> | null;
};

const state: SyncState = {
  knownGeneration: null,
  lastCheckedAt: 0,
  inflight: null,
};

/**
 * 읽기 라우트 진입 시 호출 (다른 await 와 병렬로 시작해도 된다). 절대 reject 하지 않는다.
 * 요청 컨텍스트 밖(Data Cache 없음)에서는 조용히 no-op — 매 호출 새 토큰을 만들어 캐시를 비우는 일이 없도록.
 */
export function syncStorePublicReadCachesWithSharedGeneration(): Promise<void> {
  const now = Date.now();
  if (now - state.lastCheckedAt < STORE_PUBLIC_SHARED_CACHE_SYNC_WINDOW_MS) {
    return Promise.resolve();
  }
  if (state.inflight) return state.inflight;

  const flight = (async () => {
    try {
      const generation = await readSharedStorePublicCacheGeneration();
      if (typeof generation === "string" && generation) {
        if (generation !== state.knownGeneration) {
          // 첫 확인(null)도 purge — cold 인스턴스는 비어 있어 비용 0, 확인 실패 후 재시도 시 안전.
          purgeAllStorePublicServerMemoryCaches();
          state.knownGeneration = generation;
        }
      }
    } catch {
      /* Data Cache 미가용(요청 컨텍스트 밖 등) — TTL 이 상한으로 남는다 */
    } finally {
      state.lastCheckedAt = Date.now();
    }
  })().finally(() => {
    if (state.inflight === flight) state.inflight = null;
  });
  state.inflight = flight;
  return flight;
}

/**
 * 관리자 쓰기 성공 직후 (Route Handler). 로컬 인스턴스는 즉시 비우고, 다른 인스턴스는 다음 sync 에서 비운다.
 * 실패해도 쓰기 응답을 막지 않는다 (best-effort, 상한은 기존 TTL).
 */
export function bumpStorePublicSharedCacheGeneration(reason: string): void {
  purgeAllStorePublicServerMemoryCaches();
  // 이 인스턴스도 다음 읽기에서 새 세대를 바로 확인하도록 창 리셋.
  state.lastCheckedAt = 0;
  try {
    revalidateTag(STORE_PUBLIC_SHARED_CACHE_TAG, { expire: 0 });
  } catch (e) {
    console.warn("[store-public-shared-cache] revalidateTag failed", reason, e);
  }
}

/** 테스트 */
export function resetStorePublicSharedCacheGenerationForTests(): void {
  state.knownGeneration = null;
  state.lastCheckedAt = 0;
  state.inflight = null;
}
