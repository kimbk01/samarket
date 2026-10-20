import { Suspense } from "react";
import { AdminPerformancePage } from "@/components/admin/performance/AdminPerformancePage";

export default function PerformancePage() {
  return (
    <Suspense fallback={null}>
      <AdminPerformancePage />
    </Suspense>
  );
}
