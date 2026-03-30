/**
 * 용어 고정: **메인 1단** (Main tier-1)
 *
 * - 의미: 앱 전역 최상단 바 — 모바일 탐색형 화면에서만 쓰는 동네 선택 · 검색 · 알림 · 햄버거 메뉴(`RegionBar`).
 * - 단일 구현: `components/layout/RegionBar.tsx` (시각 껍데기: `TradePrimaryAppBarShell`)
 * - 공통 삽입: `app/(main)/layout.tsx` → `<AppStickyHeader />` 안에서만 기본 렌더.
 * - 중복 방지: `ConditionalAppShell`에 `regionBarInLayout`를 넘기면 여기서는 `RegionBar`를 다시 그리지 않음.
 *
 * 일부 화면(내정보, 상품 상세, 채팅방, 검색, 주문 허브, 매장 등)은 `AppStickyHeader`에서 메인 1단을 숨기고
 * 전용 앱바를 씀 — 동작이 달라 별 컴포넌트이나, 배경·토큰은 가능한 `TradePrimaryAppBarShell`을 공유.
 *
 * (참고) **TRADE 메뉴 탭**(`TradePrimaryTabs`)은 메인 1단 **아래** 줄이며, 메인 1단과 혼동하지 않음.
 *
 * TRADE 피드·탭 **스타일·간격 단일 출처** (`components/trade` + `lib/trade/ui`):
 * - `post-spacing.ts` — 메뉴/2단 앱바 ~ 첫 게시물
 * - `content-shell.ts` — 본문 기준선 래퍼
 * - `secondary-tabs-surface.ts` — 2단 카테고리 앱바 표면
 * - `trade-primary-tabs-classes.ts` — TRADE 메뉴 탭 행 Tailwind
 * - `market-topic-scroll.ts` — 마켓 주제 칩 가로 스크롤 행
 * - `tabs/use-trade-tabs.ts` — 탭 데이터·캐시
 */

export {};
