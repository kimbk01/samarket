import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

function SkeletonRow() {
  return (
    <div className="flex gap-3 rounded-ui-rect border border-sam-fg/[0.06] bg-sam-surface p-3 shadow-sm">
      <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-ui-rect bg-sam-border-soft/90" aria-hidden />
      <div className="min-w-0 flex-1 space-y-2 py-0.5">
        <div className="h-3 w-16 animate-pulse rounded bg-sam-border-soft/80" />
        <div className="h-4 w-[88%] max-w-md animate-pulse rounded bg-sam-border-soft/90" />
        <div className="h-3 w-[72%] max-w-sm animate-pulse rounded bg-sam-border-soft/70" />
        <div className="flex gap-2 pt-1">
          <div className="h-3 w-10 animate-pulse rounded bg-sam-surface-muted" />
          <div className="h-3 w-10 animate-pulse rounded bg-sam-surface-muted" />
          <div className="h-3 w-10 animate-pulse rounded bg-sam-surface-muted" />
        </div>
      </div>
    </div>
  );
}

/** 첫 페인트·캐시 미스 시 — 텍스트 한 줄 대신 카드 골격으로 가벼운 인상 */
export function CommunityFeedSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className={`${APP_MAIN_GUTTER_X_CLASS} space-y-2.5 pt-2 pb-1`} aria-busy aria-label="피드 불러오는 중">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
