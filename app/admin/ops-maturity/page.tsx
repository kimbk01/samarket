import { Suspense } from "react";
import { AdminOpsMaturityPage } from "@/components/admin/ops-maturity/AdminOpsMaturityPage";

export default function OpsMaturityPage() {
  return (
    <Suspense fallback={null}>
      <AdminOpsMaturityPage />
    </Suspense>
  );
}
