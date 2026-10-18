import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminOrderOpsScreen } from "@/components/admin/store-orders/AdminOrderOpsScreen";

/** 취소 요청 — pending (request time) / cancelled (cancel event time). */
export default function AdminStoreOrderCancellationsPage() {
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <AdminOrderOpsScreen screen="cancellations" />
    </Suspense>
  );
}
