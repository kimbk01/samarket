import { PhilifePostDetailSkeleton } from "@/components/community/PhilifeRouteSkeletons";

/** `/philife/[postId]` 글 상세 — 상세 구조 스켈레톤 (이 경로의 유일한 스켈레톤 소유자) */
export default function PhilifePostDetailLoading() {
  return <PhilifePostDetailSkeleton />;
}
