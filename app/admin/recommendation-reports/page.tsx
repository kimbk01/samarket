import { Suspense } from "react";
import { AdminLoadingFallback } from "@/components/admin/AdminLoadingFallback";
import { AdminRecommendationReportsPage } from "@/components/admin/recommendation-reports/AdminRecommendationReportsPage";

export default function RecommendationReportsPage() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminRecommendationReportsPage />
    </Suspense>
  );
}
