import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminStoreReviewsPage } from "@/components/admin/stores/AdminStoreReviewsPage";

export default function AdminStoreReviewsRoute() {
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <AdminStoreReviewsPage />
    </Suspense>
  );
}
