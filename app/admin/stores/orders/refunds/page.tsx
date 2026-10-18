import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminOrderOpsScreen } from "@/components/admin/store-orders/AdminOrderOpsScreen";

/** 환불 요청 — pending (request time) / refunded (`refunded_at`). Decisions only in the detail modal. */
export default function AdminStoreOrderRefundsPage() {
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <AdminOrderOpsScreen screen="refunds" />
    </Suspense>
  );
}
