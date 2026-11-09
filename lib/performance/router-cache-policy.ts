/**
 * Next 클라이언트 라우터 캐시 만료(초) — `next.config.js` `experimental.staleTimes` 와 같은 값이어야 한다
 * (일치는 `lib/performance/__tests__/router-cache-policy.test.ts` 가 검사).
 *
 * Next 16.1.7 동작(설치본 코드 확인): 화면에 계속 보이는 Link(하단 탭)는 캐시가 **시간 만료돼도 다시 받지 않는다**
 * — `pingVisibleLinks` 는 트리 변경·명시적 무효화 때만, `router.prefetch(onInvalidate)` 도 무효화 때만 불린다
 * (`next/dist/client/components/links.js` · `segment-cache/cache.js`). 그래서 복귀 재준비가 필요하다.
 */
export const ROUTER_CACHE_STALE_TIMES_S = {
  dynamic: 300,
  static: 600,
} as const;

/**
 * 복귀 재준비 기준 — 숨겨진 시간이 이 값 이상이면 하단 탭 프리페치가 만료됐을 수 있다.
 * 더 짧은 쪽(dynamic)을 쓴다. 아직 신선한 항목은 Next 스케줄러가 캐시에서 바로 끝내 네트워크를 쓰지 않는다.
 */
export const ROUTER_PREFETCH_REWARM_MIN_HIDDEN_MS = ROUTER_CACHE_STALE_TIMES_S.dynamic * 1000;
