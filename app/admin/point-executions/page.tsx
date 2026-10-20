import { Suspense } from "react";
import { AdminPointExecutionPage } from "@/components/admin/point-executions/AdminPointExecutionPage";

export default function AdminPointExecutionsPage() {
  return (
    <Suspense fallback={null}>
      <AdminPointExecutionPage />
    </Suspense>
  );
}
