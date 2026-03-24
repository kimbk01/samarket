import { Suspense } from "react";
import { AdminRecommendationAnalyticsPage } from "@/components/admin/recommendation/AdminRecommendationAnalyticsPage";

export default function RecommendationAnalyticsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-gray-500">불러오는 중…</div>}>
      <AdminRecommendationAnalyticsPage />
    </Suspense>
  );
}
