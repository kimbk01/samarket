import { Suspense } from "react";
import { AdminPointChargeListPage } from "@/components/admin/points/AdminPointChargeListPage";

export default function AdminPointChargesPage() {
  return (
    <Suspense fallback={null}>
      <AdminPointChargeListPage />
    </Suspense>
  );
}
