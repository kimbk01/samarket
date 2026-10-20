import { Suspense } from "react";
import { AdminLoadingFallback } from "@/components/admin/AdminLoadingFallback";
import { AdminRecommendationExperimentPage } from "@/components/admin/recommendation-experiments/AdminRecommendationExperimentPage";

export default function RecommendationExperimentsPage() {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminRecommendationExperimentPage />
    </Suspense>
  );
}
