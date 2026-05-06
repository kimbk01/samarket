import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { MAIN_SHELL_BOTTOM_SAFE_PAD_CLASS } from "@/components/layout/MainRouteLoading";

/** `/mypage` 마이페이지 트리 */
export default function MypageSegmentLoading() {
  return (
    <div className={`min-h-screen min-w-0 bg-sam-app ${MAIN_SHELL_BOTTOM_SAFE_PAD_CLASS}`}>
      {/* header shell (server-safe) */}
      <div className="sticky top-0 z-10 border-b border-sam-border bg-sam-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[960px] items-center gap-3 px-4 sm:px-6">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-sam-border-soft/80" />
          <div className="h-4 w-24 animate-pulse rounded-ui-rect bg-sam-border-soft/80" />
          <div className="flex-1" />
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-sam-border-soft/60" />
        </div>
      </div>

      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="mx-auto w-full max-w-[960px] px-4 py-4 sm:px-6">
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-ui-rect bg-sam-border-soft/70" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-16 animate-pulse rounded-ui-rect bg-sam-border-soft/60" />
              <div className="h-16 animate-pulse rounded-ui-rect bg-sam-border-soft/60" />
              <div className="h-16 animate-pulse rounded-ui-rect bg-sam-border-soft/60" />
              <div className="h-16 animate-pulse rounded-ui-rect bg-sam-border-soft/60" />
            </div>
            <div className="h-16 animate-pulse rounded-ui-rect bg-sam-border-soft/60" />
            <div className="h-16 animate-pulse rounded-ui-rect bg-sam-border-soft/60" />
          </div>
        </div>
      </div>
    </div>
  );
}
