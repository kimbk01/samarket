import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminStoreReportsPage } from "@/components/admin/stores/AdminStoreReportsPage";

export default function AdminStoreReportsRoute() {
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <AdminStoreReportsPage />
    </Suspense>
  );
}
