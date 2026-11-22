import { MainSegmentPendingLoading } from "@/components/layout/MainSegmentPendingLoading";

/**
 * `/market` 세그먼트 — 허브 첫 화면은 스켈레톤을 덮지 않는다(덮으면 1차 탭 전환 체감이 440ms 느려진다,
 * 본문은 `MarketCategoryRouteFallback`·클라 피드 캐시가 채운다). 하위 화면 대기 = DIBAY 대기 스피너(450ms 뒤).
 */
export default function MarketSegmentLoading() {
  return <MainSegmentPendingLoading />;
}
