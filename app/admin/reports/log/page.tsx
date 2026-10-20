import { Suspense } from "react";
import { AdminSanctionLedgerPage } from "@/components/admin/reports/AdminSanctionLedgerPage";

export default function AdminReportsLogPage() {
  return (
    <Suspense fallback={null}>
      <AdminSanctionLedgerPage />
    </Suspense>
  );
}
