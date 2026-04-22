/**
 * Chrome(Chromium) 기준 — **로컬 개발과 운영 동일**하게 적용하는 내비게이션 부하 상한.
 *
 * 목표: 라우트 전환 직후 **현재 페이지 RSC/페인트**가 `router.prefetch` 다발·긴 메인 스레드 태스크에 밀리지 않게 한다.
 * (탭 전환 체감은 `Link prefetch`·사용자 호버·이후 라운드로 보완)
 */
/** 연속 경로 변경 시 마지막 구간만 프리페치(빠른 뒤로가기·중첩 이동 시 작업 합류) */
export const BOTTOM_NAV_PREFETCH_PATH_DEBOUNCE_MS = 150;

/** `requestIdleCallback` 스케줄 지연 — 페인트·현재 세그먼트 페치 우선(다음 탭 RSC는 조금 더 빨리 시작) */
export const BOTTOM_NAV_PREFETCH_IDLE_DELAY_MS = 90;

/** `router.prefetch` 호출 간격 — 단일 긴 태스크 대신 짧은 조각으로 분산 */
export const BOTTOM_NAV_PREFETCH_SPREAD_MS = 40;
