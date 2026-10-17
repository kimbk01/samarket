import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminStoreCommissionLedgerPage } from "@/components/admin/stores/AdminStoreCommissionLedgerPage";

export default function AdminStoreSettlementsRoute() {
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <AdminStoreCommissionLedgerPage />
    </Suspense>
  );
}
