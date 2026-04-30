import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

/** `/post/[id]` 등 — 거래 피드와 동일 골격으로 전환 체감만 정렬(Suspense 이중 경계 제거 후 단일 로딩) */
export default function PostSegmentLoading() {
  return <MainFeedRouteLoading rows={5} />;
}
