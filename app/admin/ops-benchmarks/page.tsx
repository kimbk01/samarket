import { Suspense } from "react";
import { AdminOpsBenchmarksPage } from "@/components/admin/ops-benchmarks/AdminOpsBenchmarksPage";

export default function OpsBenchmarksPage() {
  return (
    <Suspense fallback={null}>
      <AdminOpsBenchmarksPage />
    </Suspense>
  );
}
