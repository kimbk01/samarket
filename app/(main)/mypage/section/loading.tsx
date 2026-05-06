import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { MAIN_SHELL_BOTTOM_SAFE_PAD_CLASS } from "@/components/layout/MainRouteLoading";

/**
 * MI3: 스택(서브) 라우트 전환 시, RSC 페이로드를 기다리지 않고
 * 헤더/프레임 셸을 즉시 표시하기 위한 segment-level loading.
 *
 * - 데이터/네트워크 최적화는 MI3 범위 밖
 * - "빈 흰 화면" 방지: 항상 app 배경 + 상단 바 + 본문 스켈레톤 유지
 */
export default function MypageSectionLoading() {
  return (
    <div className={`min-h-screen min-w-0 bg-sam-app ${MAIN_SHELL_BOTTOM_SAFE_PAD_CLASS}`}>
      {/* header shell (no client deps) */}
      <div className="sticky top-0 z-10 border-b border-sam-border bg-sam-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[960px] items-center gap-3 px-4 sm:px-6">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-sam-border-soft/80" />
          <div className="h-4 w-32 animate-pulse rounded-ui-rect bg-sam-border-soft/80" />
          <div className="flex-1" />
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-sam-border-soft/60" />
        </div>
      </div>

      {/* body shell */}
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="mx-auto w-full max-w-[960px] px-4 py-4 sm:px-6">
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-ui-rect bg-sam-border-soft/70" />
            <div className="h-16 animate-pulse rounded-ui-rect bg-sam-border-soft/60" />
            <div className="h-16 animate-pulse rounded-ui-rect bg-sam-border-soft/60" />
            <div className="h-16 animate-pulse rounded-ui-rect bg-sam-border-soft/60" />
          </div>
        </div>
      </div>
    </div>
  );
}

