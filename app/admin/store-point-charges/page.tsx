import { Suspense } from "react";
import { AdminStorePointChargeListPage } from "@/components/admin/store-points/AdminStorePointChargeListPage";

export default function AdminStorePointChargesRoute() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-sam-muted">…</p>}>
      <AdminStorePointChargeListPage />
    </Suspense>
  );
}
