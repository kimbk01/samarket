import { MainTabSegmentLoading } from "@/components/layout/MainTabSegmentLoading";

/** `/community-messenger` root tab: main bottom-nav transitions must not show skeleton shell. */
/**
 * R-0 (Owner 승인 2026-11-10): 탭 첫 화면(`/community-messenger`)만 중립 로딩 블록, 하위 화면은 null(자체 스켈레톤 소유) —
 * `components/layout/MainTabSegmentLoading.tsx`.
 */
export default function CommunityMessengerSegmentLoading() {
  return <MainTabSegmentLoading tabRootPath="/community-messenger" />;
}
