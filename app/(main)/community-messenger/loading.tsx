import { MainSegmentPendingLoading } from "@/components/layout/MainSegmentPendingLoading";

/**
 * `/community-messenger` — 허브 첫 화면은 스켈레톤 없이 비움(하단 탭 계약) · 통화 화면은 그대로(통화 규정).
 * 그 밖의 하위 화면(연락처 등) 대기 = DIBAY 대기 스피너(450ms 뒤).
 */
export default function CommunityMessengerSegmentLoading() {
  return <MainSegmentPendingLoading />;
}
