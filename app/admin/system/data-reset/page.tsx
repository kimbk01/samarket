import { Suspense } from "react";
import { AdminDataResetPage } from "@/components/admin/system/AdminDataResetPage";

export default function AdminSystemDataResetPage() {
  return (
    <Suspense fallback={null}>
      <AdminDataResetPage />
    </Suspense>
  );
}
