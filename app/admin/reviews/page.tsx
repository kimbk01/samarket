import { Suspense } from "react";
import { AdminReviewListPage } from "@/components/admin/reviews/AdminReviewListPage";

export default function AdminReviewsPage() {
  return (
    <Suspense fallback={null}>
      <AdminReviewListPage />
    </Suspense>
  );
}
