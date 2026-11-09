import { MainTabSegmentLoading } from "@/components/layout/MainTabSegmentLoading";

/** `/stores` root tab: main bottom-nav transitions must not show feed skeleton. */
/**
 * R-0 (Owner 승인 2026-11-10): 탭 첫 화면(`/stores`)만 중립 로딩 블록, 하위 화면은 null(자체 스켈레톤 소유) —
 * `components/layout/MainTabSegmentLoading.tsx`.
 */
export default function StoresSegmentLoading() {
  return <MainTabSegmentLoading tabRootPath="/stores" />;
}
