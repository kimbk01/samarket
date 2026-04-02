import { CommunityFeedSkeleton } from "@/components/community/CommunityFeedSkeleton";

/** 하단 탭으로 /philife 진입 시 RSC 경계에서 즉시 골격 표시 */
export default function PhilifeLoading() {
  return (
    <div className="min-h-screen min-w-0 max-w-full overflow-x-hidden bg-background pb-28">
      <CommunityFeedSkeleton rows={5} />
    </div>
  );
}
