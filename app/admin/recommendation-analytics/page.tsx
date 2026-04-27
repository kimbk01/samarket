import { Suspense } from "react";
import { AdminLoadingFallback } from "@/components/admin/AdminLoadingFallback";
import { AdminRecommendationAnalyticsPage } from "@/components/admin/recommendation/AdminRecommendationAnalyticsPage";

export default function RecommendationAnalyticsPage() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminRecommendationAnalyticsPage />
    </Suspense>
  );
}
