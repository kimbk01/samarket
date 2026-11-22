import { MainSegmentPendingLoading } from "@/components/layout/MainSegmentPendingLoading";

/**
 * `/post/[id]` segment loading.
 * 거래 목록→상세 카드 연출 중에는 그리지 않는다(연출이 화면을 소유). 그 밖의 대기 = DIBAY 대기 스피너(450ms 뒤).
 * Deep-link / refresh: no Marketplace skeleton panel.
 */
export default function PostSegmentLoading() {
  return <MainSegmentPendingLoading skipWhileTradeComposition />;
}
