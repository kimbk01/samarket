/**
 * 메인 앱 셸 뷰포트 — 허브·피드는 `main-hub-scroll-column.ts` (1단 고정 + `<main>` 단일 스크롤).
 */

/** `MainAppProviderTree` — 앱 전체 높이를 뷰포트에 맞춤 */
export const MAIN_SHELL_VIEWPORT_LOCK_CLASS =
  "flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden supports-[height:100svh]:h-[100svh] supports-[height:100svh]:max-h-[100svh]";

export type MainShellScrollColumnFlags = {
  isChatRoomDetail: boolean;
  isStoreOwnerAdminRoute: boolean;
  isMainColumnViewportLocked: boolean;
};

/** true면 `<main>` 이 유일한 세로 스크롤 컨테이너(허브·피드·배달 목록) */
export function resolvesMainScrollInMainColumn(flags: MainShellScrollColumnFlags): boolean {
  return (
    !flags.isChatRoomDetail && !flags.isStoreOwnerAdminRoute && !flags.isMainColumnViewportLocked
  );
}

export const MAIN_COLUMN_SCROLL_CLASS =
  "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch]";

export const APP_SHELL_FILL_VIEWPORT_CLASS =
  "flex min-h-0 flex-1 flex-col overflow-hidden";

/**
 * `AppStickyHeader` 아래 남은 높이만 채움 — `min-h-[100dvh]` 와 병행 금지(헤더+본문 > 뷰포트 → 스크롤 불가).
 */
export function buildMainShellInnerRootClass(opts?: { heroMenuSurface?: boolean }): string {
  const bg = opts?.heroMenuSurface ? "" : " bg-sam-app";
  return `${APP_SHELL_FILL_VIEWPORT_CLASS} min-w-0 max-w-full overflow-x-clip${bg}`;
}
