import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminOrderOpsScreen } from "@/components/admin/store-orders/AdminOrderOpsScreen";

/** 주문 목록 — every order, created-at basis (docs/admin-store-order-ops-ssot.md). */
export default function AdminStoreOrdersConsolePage() {
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <AdminOrderOpsScreen screen="list" />
    </Suspense>
  );
}
