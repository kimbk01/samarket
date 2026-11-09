import { MainTabSegmentLoading } from "@/components/layout/MainTabSegmentLoading";

/**
 * `/market` 세그먼트 — Next `loading.tsx` 가 스켈레톤을 덮으면 1차 탭 전환 체감이 440ms 느려진다.
 * 본문은 `MarketCategoryRouteFallback`·클라 피드 캐시가 채운다.
 */
/**
 * R-0 (Owner 승인 2026-11-10): 탭 첫 화면(`/market`)만 중립 로딩 블록, 하위 화면은 null(자체 스켈레톤 소유) —
 * `components/layout/MainTabSegmentLoading.tsx`.
 */
export default function MarketSegmentLoading() {
  return <MainTabSegmentLoading tabRootPath="/market" />;
}
