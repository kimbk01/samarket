import { MainSegmentPendingLoading } from "@/components/layout/MainSegmentPendingLoading";

/** `/my` — 허브 첫 화면은 스켈레톤 없이 비움(하단 탭 계약). 하위 화면 대기 = DIBAY 대기 스피너(450ms 뒤). */
export default function MySegmentLoading() {
  return <MainSegmentPendingLoading />;
}
