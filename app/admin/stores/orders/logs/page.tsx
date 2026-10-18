import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminOrderAuditLogsScreen } from "@/components/admin/store-orders/AdminOrderAuditLogsScreen";

export default function AdminStoreOrderLogsPage() {
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <AdminOrderAuditLogsScreen />
    </Suspense>
  );
}
