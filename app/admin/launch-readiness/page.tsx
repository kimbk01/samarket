import { Suspense } from "react";
import { AdminLaunchReadinessPage } from "@/components/admin/launch-readiness/AdminLaunchReadinessPage";

export default function LaunchReadinessPage() {
  return (
    <Suspense fallback={null}>
      <AdminLaunchReadinessPage />
    </Suspense>
  );
}
