import { MainTabSegmentLoading } from "@/components/layout/MainTabSegmentLoading";

/**
 * `/philife/**` 세그먼트 로딩 — 중립(빈 화면). 설계서 §13-2·3.
 *
 * 피드 스켈레톤은 피드 페이지 안(`CommunityFeed`)에만 둔다. 여기서 피드 스켈레톤을 그리면
 * 상세·글쓰기·내 활동 등 **피드가 아닌 화면**의 로딩에 피드가 보이고, 피드 자체 스켈레톤과 2번 깜빡인다.
 * 하위 화면 스켈레톤 소유자: `[postId]/loading.tsx` · `write/page.tsx` Suspense · `my/page.tsx` Suspense.
 */
/**
 * R-0 (Owner 승인 2026-11-10): 탭 첫 화면(`/philife`)만 중립 로딩 블록, 하위 화면은 null(자체 스켈레톤 소유) —
 * `components/layout/MainTabSegmentLoading.tsx`.
 */
export default function PhilifeSegmentLoading() {
  return <MainTabSegmentLoading tabRootPath="/philife" />;
}
