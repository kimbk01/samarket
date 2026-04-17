# Chrome 내비게이션 성능 기준 (개발 = 운영)

Chromium 계열(Chrome, Edge)에서 **소프트 내비게이션 직후** 체감이 나빠지는 흔한 원인은 다음과 같다.

1. **현재 라우트 RSC/JS 페치**와 **백그라운드 `router.prefetch` 다발**이 같은 구간에서 CPU·네트워크를 나눠 쓴다.
2. **`useLayoutEffect` + 무거운 동기 작업**이 첫 페인트 전에 실행된다.

## 제품 기준 (코드 단일 출처)

상수는 `lib/performance/chrome-navigation-policy.ts`에만 둔다. 값을 바꿀 때는 해당 파일만 수정한다.

| 항목 | 의미 |
|------|------|
| `BOTTOM_NAV_PREFETCH_PATH_DEBOUNCE_MS` | 연속 경로 변경 시 마지막 안정 시점만 프리페치 |
| `BOTTOM_NAV_PREFETCH_IDLE_DELAY_MS` | `requestIdleCallback` 지연 — 페인트·현재 세그먼트 우선 |
| `BOTTOM_NAV_PREFETCH_SPREAD_MS` | 탭별 `prefetch` 간격 — 긴 메인 스레드 태스크 방지 |

## 구현 위치

- 하단 탭 배치 프리페치: `components/layout/BottomNav.tsx` (`useEffect`, 위 상수 사용)
- 전역 셸 플래그: `components/layout/ConditionalAppShell.tsx` (`useMemo`)
- 헤더 경로 파생값: `components/layout/AppStickyHeader.tsx` (`useMemo`)

## Next.js 개발 번들 (`npm run dev`)

메인 탭 **선로딩은 운영과 동일하게 기본 켜짐**(탭 이동 콜드 스타트 완화). 컴파일 큐만 과하면 아래 env 로 끈다.

- `NEXT_PUBLIC_DISABLE_MAIN_NAV_PROGRAMMATIC_PREFETCH=1` → 배치 `router.prefetch` 끔.
- `NEXT_PUBLIC_DISABLE_MAIN_NAV_LINK_PREFETCH=1` → 탭 `Link prefetch` 끔.
- `NEXT_PUBLIC_DISABLE_MESSENGER_LIST_ROUTE_PREFETCH=1` → 메신저 방 목록 `router.prefetch` 끔.
- Philife 글로벌 피드 워밍·홈 셸 예열 → `PhilifeFeedWarmPrefetch`, `warmMainShellData` 에서 dev 생략(부하 분리).

정책 함수: `lib/runtime/next-js-dev-client.ts`
