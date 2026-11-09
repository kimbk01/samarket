import { CommunityFeedSkeleton } from "@/components/community/CommunityFeedSkeleton";
import { MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS } from "@/lib/main-menu/bottom-nav-config";

/**
 * Bottom padding for full-height loading shells — 본문과 같은 SSOT (`MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS`, N-02).
 * 이전 하드코딩 76px+safe 는 탭 돌출(`--main-scroll-nav-overhang`)을 빠뜨렸다.
 */
export const MAIN_SHELL_BOTTOM_SAFE_PAD_CLASS = MAIN_SCROLL_PADDING_WITH_BOTTOM_NAV_CLASS;

/** Philife / trade-style feed routes: card skeleton list */
export function MainFeedRouteLoading({ rows = 5 }: { rows?: number }) {
  return (
    <div
      className={`min-h-screen min-w-0 max-w-full overflow-x-hidden bg-sam-app ${MAIN_SHELL_BOTTOM_SAFE_PAD_CLASS}`}
    >
      <CommunityFeedSkeleton rows={rows} />
    </div>
  );
}

/** Form-heavy routes (settings, mypage forms): block skeleton */
export function MainFormRouteLoading() {
  return (
    <div
      className={`mx-auto flex w-full max-w-[960px] flex-col gap-4 px-4 py-4 sm:px-6 ${MAIN_SHELL_BOTTOM_SAFE_PAD_CLASS}`}
    >
      <div className="h-10 animate-pulse rounded-ui-rect bg-sam-border-soft/80" />
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-ui-rect bg-ui-surface shadow-sm" />
        <div className="h-32 animate-pulse rounded-ui-rect bg-ui-surface shadow-sm" />
        <div className="h-40 animate-pulse rounded-ui-rect bg-ui-surface shadow-sm" />
      </div>
    </div>
  );
}

/** Home trade shell: feed column + optional wide-layout side column */
export function MainHomeShellLoading() {
  return (
    <div
      className={`mx-auto flex w-full max-w-[960px] flex-col gap-4 px-4 py-4 sm:px-6 ${MAIN_SHELL_BOTTOM_SAFE_PAD_CLASS}`}
    >
      <div className="h-10 animate-pulse rounded-ui-rect bg-sam-border-soft/80" />
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

/**
 * FAIL② (2026-11-09) — `(main)` 셸 첫 그림. `MainAppHeaderStackWrap` 의 클라이언트 전용(`ssr: false`) 래퍼가
 * 셸·본문·하단 탭 전체를 감싸 서버 HTML 에 보이는 내용이 0 이다. 배포 후 첫 탭 이동이 문서 이동(Next 빌드 ID
 * 불일치 → MPA)이 되면 OS 시작 화면 없이 새 빌드 JS 가 마운트될 때까지(3~6초) 빈 화면이 보였다.
 * 이 fallback 이 서버 HTML 에 그려져 그 구간을 로딩 화면으로 채운다. 경로 무관 중립 블록만(하단 탭·문구 없음).
 */
export function MainShellDocumentLoading() {
  return (
    <div data-main-shell-document-loading="" aria-busy="true" className="flex min-h-0 flex-1 flex-col bg-sam-app">
      <MainFormRouteLoading />
    </div>
  );
}
