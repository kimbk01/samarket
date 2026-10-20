import { Suspense } from "react";
import { AdminLoadingFallback } from "@/components/admin/AdminLoadingFallback";
import { AdminRecommendationMonitoringPage } from "@/components/admin/recommendation-monitoring/AdminRecommendationMonitoringPage";

export default function RecommendationMonitoringPage() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminRecommendationMonitoringPage />
    </Suspense>
  );
}
