import { MainSegmentPendingLoading } from "@/components/layout/MainSegmentPendingLoading";

/**
 * `/philife/**` 세그먼트 로딩 — 피드 스켈레톤을 두지 않는다(설계서 §13-2·3: 피드가 아닌 화면에 피드가 보이고 2번 깜빡임).
 * 하위 화면 스켈레톤 소유자: `[postId]/loading.tsx` · `write/page.tsx` Suspense · `my/page.tsx` Suspense.
 * 그 밖의 하위 화면 대기 = DIBAY 대기 스피너(450ms 뒤) · 허브 첫 화면은 예전처럼 비움(`MainSegmentPendingLoading`).
 */
export default function PhilifeSegmentLoading() {
  return <MainSegmentPendingLoading />;
}
