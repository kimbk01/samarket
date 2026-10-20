import { Suspense } from "react";
import { AdminOpsLearningPage } from "@/components/admin/ops-learning/AdminOpsLearningPage";

export default function OpsLearningPage() {
  return (
    <Suspense fallback={null}>
      <AdminOpsLearningPage />
    </Suspense>
  );
}
