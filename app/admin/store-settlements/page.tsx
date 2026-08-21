import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminStoreSettlementsPage } from "@/components/admin/stores/AdminStoreSettlementsPage";

export default function AdminStoreSettlementsRoute() {
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <AdminStoreSettlementsPage />
    </Suspense>
  );
}
