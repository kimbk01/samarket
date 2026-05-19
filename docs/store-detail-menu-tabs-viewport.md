# 매장 메뉴 탭 뷰포트 — 검증 체크리스트

## 구조 (근본)

- **스크롤 루트**: `lib/ui/store-detail-scroll-root.ts` — `<main>` vs `document` 판별·캐시. 구독은 `useStoreDetailScrollRootScroll` **1곳만** (`window`+`main` 이중 구독 금지).
- **헤더 오프셋**: `lib/ui/store-detail-viewport-metrics.ts` — safe-area probe 200ms 캐시.
- **탭 고정**: CSS `sticky` **사용 안 함** — 슬라이드 셸 `transform` 조상. pin 시 `CategoryStickyTabs` → **`body` 포털** (`z-[55]`).
- **앵커**: `useStoreDetailMenuTabsViewport` — `estimate` 1회 → 탭 DOM 후 `refine` 1회 (`anchorKind`). `store-detail-menu-tabs-anchored` 이벤트로 pin 임계값 동기화.
- **이벤트 상수**: `lib/dibay/store-detail-menu-tabs-events.ts` (훅 간 순환 import 방지).

## 수동 (기기별)

- [ ] iOS Safari: 목록 → 매장 — 탭이 헤더 바로 아래, 히어로가 먼저 보였다 올라가지 않음
- [ ] iOS: 메뉴 목록 스크롤 시 탭이 상단에 **고정** 유지
- [ ] iOS: 위로 스크롤해 히어로 영역 — 탭 고정 **해제**, 히어로·글래스 헤더 노출
- [ ] Android Chrome: 동일
- [ ] 상품/장바구니 → 매장 뒤로: 탭 위치·고정 동일
- [ ] 태블릿 가로/세로: 탭 바 폭이 본문 컬럼(`APP_MAIN_COLUMN`)과 일치

## 자동

- `npx vitest run lib/ui/__tests__/store-detail-menu-tabs-viewport.test.ts`
- `npx tsc --noEmit`
