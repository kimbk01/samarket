import { Suspense } from "react";
import { AdminLoadingFallback } from "@/components/admin/AdminLoadingFallback";
import { AdminRecommendationDeploymentPage } from "@/components/admin/recommendation-deployments/AdminRecommendationDeploymentPage";

export default function RecommendationDeploymentsPage() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminRecommendationDeploymentPage />
    </Suspense>
  );
}
