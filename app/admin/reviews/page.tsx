import { Suspense } from "react";
import { AdminReviewListPage } from "@/components/admin/reviews/AdminReviewListPage";

/** 목록 조건·쪽은 URL 쿼리 (useSearchParams) — Suspense 경계 */
export default function AdminReviewsPage() {
  return (
    <Suspense fallback={null}>
      <AdminReviewListPage />
    </Suspense>
  );
}
