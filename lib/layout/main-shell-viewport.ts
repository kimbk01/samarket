/**
 * 메인 앱 셸 뷰포트 — 헤더(`AppStickyHeader`)는 고정 높이, 본문은 `<main>` 만 스크롤.
 * 문서(body) 스크롤 + 헤더 `sticky` 조합은 flex 자식에서 빈번히 깨져 배달 허브 상단이 밀린다.
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
