import { Suspense } from "react";
import { AdminLoadingFallback } from "@/components/admin/AdminLoadingFallback";
import { AdminRecommendationAutomationPage } from "@/components/admin/recommendation-automation/AdminRecommendationAutomationPage";

export default function RecommendationAutomationPage() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminRecommendationAutomationPage />
    </Suspense>
  );
}
