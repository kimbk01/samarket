/**
 * 메인 허브(`/stores` · `/philife` · `/market` · `/mypage` 등) — 단일 스크롤 계약.
 *
 * - 1단·업종 탭: 스크롤 **밖** `shrink-0` (구조적으로 상단 고정)
 * - MAIN hub transition: Header는 push surface **안**에 두어 Body와 ONE transform authority 공유
 *   (`ConditionalAppShell` `hubChromeHeader` → `AppRouteTransition`)
 * - 본문: `<main>` 단일 `overflow-y-auto` (`flex-1 basis-0 min-h-0`)
 * - `position: sticky`·문서(body) 스크롤·`min-h-[100dvh]` on flex child 금지
 * - `PhilifeMessengerFromHeaderStack` · `TradeHistoryFromHeaderStack` 래퍼는
 *   `flex min-h-0 flex-1 flex-col` 필수 — `flex-1`만 있으면 `app-shell` 높이가 콘텐츠만큼 늘어
 *   body(`overflow:hidden`)에서 세로 스크롤이 막힌다.
 *
 * CSS: `app/app-shell.css` — `.main-hub-scroll-*`
 */

export function resolvesMainHubScrollColumn(opts: {
  regionBarInLayout: boolean;
  mainScrollInMainColumn: boolean;
  isChatRoomDetail: boolean;
}): boolean {
  return (
    opts.regionBarInLayout && opts.mainScrollInMainColumn && !opts.isChatRoomDetail
  );
}

/** `ConditionalAppShell` 루트 — 뷰포트 잠금 flex 자식 */
export const MAIN_HUB_SCROLL_SHELL_ROOT_CLASS = "main-hub-scroll-shell-root main-hub-scroll-shell";

/** Tier1 + extras (배달 업종 탭 등) */
export const MAIN_HUB_SCROLL_HEADER_CLASS = "main-hub-scroll-header";

/** 유일한 세로 스크롤 컨테이너 */
export const MAIN_HUB_SCROLL_BODY_CLASS = "main-hub-scroll-body";
