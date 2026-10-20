import { Suspense } from "react";
import { AdminOpsRoutinesPage } from "@/components/admin/ops-routines/AdminOpsRoutinesPage";

export default function OpsRoutinesPage() {
  return (
    <Suspense fallback={null}>
      <AdminOpsRoutinesPage />
    </Suspense>
  );
}
