import { CommunityFeedSkeleton } from "@/components/community/CommunityFeedSkeleton";

/**
 * 하단 고정 탭·safe-area 와 맞춘 패딩 — `BOTTOM_NAV_SHELL` 높이와 동일 식.
 */
export const MAIN_SHELL_BOTTOM_SAFE_PAD_CLASS =
  "pb-[calc(4rem+env(safe-area-inset-bottom,0px))]";

/** 피드형(거래·커뮤니티·필라이프 등) — 카드 행 골격 */
export function MainFeedRouteLoading({ rows = 5 }: { rows?: number }) {
  return (
    <div
      className={`min-h-screen min-w-0 max-w-full overflow-x-hidden bg-background ${MAIN_SHELL_BOTTOM_SAFE_PAD_CLASS}`}
    >
      <CommunityFeedSkeleton rows={rows} />
    </div>
  );
}

/** 폼·설정형 — 글쓰기·마이 등 */
export function MainFormRouteLoading() {
  return (
    <div
      className={`mx-auto flex w-full max-w-[960px] flex-col gap-4 px-4 py-4 sm:px-6 ${MAIN_SHELL_BOTTOM_SAFE_PAD_CLASS}`}
    >
      <div className="h-10 animate-pulse rounded-ui-rect bg-gray-200/80" />
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-ui-rect bg-ui-surface shadow-sm" />
        <div className="h-32 animate-pulse rounded-ui-rect bg-ui-surface shadow-sm" />
        <div className="h-40 animate-pulse rounded-ui-rect bg-ui-surface shadow-sm" />
      </div>
    </div>
  );
}

/** 홈 — 칩/탭 한 줄 + 2컬럼 피드 레이아웃 골격 */
export function MainHomeShellLoading() {
  return (
    <div
      className={`mx-auto flex w-full max-w-[960px] flex-col gap-4 px-4 py-4 sm:px-6 ${MAIN_SHELL_BOTTOM_SAFE_PAD_CLASS}`}
    >
      <div className="h-10 animate-pulse rounded-ui-rect bg-gray-200/80" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-ui-rect bg-ui-surface shadow-sm" />
          <div className="h-28 animate-pulse rounded-ui-rect bg-ui-surface shadow-sm" />
          <div className="h-28 animate-pulse rounded-ui-rect bg-ui-surface shadow-sm" />
        </div>
        <div className="hidden space-y-4 lg:block">
          <div className="h-36 animate-pulse rounded-ui-rect bg-ui-surface shadow-sm" />
          <div className="h-52 animate-pulse rounded-ui-rect bg-ui-surface shadow-sm" />
        </div>
      </div>
    </div>
  );
}
