import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";

function SkeletonRow() {
  return (
    <div className={`flex gap-3 p-3 sm:p-4 ${PHILIFE_FB_CARD_CLASS}`}>
      <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-[4px] bg-[#EEF0F4]" aria-hidden />
      <div className="min-w-0 flex-1 space-y-2 py-0.5">
        <div className="h-3 w-20 animate-pulse rounded-[4px] bg-[#EEF0F4]" />
        <div className="h-4 w-[88%] max-w-md animate-pulse rounded-[4px] bg-[#EEF0F4]" />
        <div className="h-4 w-[72%] max-w-sm animate-pulse rounded-[4px] bg-[#EEF0F4]" />
        <div className="flex gap-2 pt-1">
          <div className="h-3 w-12 animate-pulse rounded-[4px] bg-[#EEF0F4]" />
          <div className="h-3 w-12 animate-pulse rounded-[4px] bg-[#EEF0F4]" />
        </div>
      </div>
    </div>
  );
}

/** 첫 페인트·캐시 미스 시 — 텍스트 한 줄 대신 카드 골격으로 가벼운 인상 */
export function CommunityFeedSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-1 px-2 pt-1 pb-1" aria-busy aria-label="피드 불러오는 중">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
