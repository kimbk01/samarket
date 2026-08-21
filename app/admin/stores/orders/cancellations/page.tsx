import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { DeliveryCancellationsClient } from "@/components/admin/delivery-orders/DeliveryCancellationsClient";

export default function AdminStoreOrderCancellationsPage() {
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <DeliveryCancellationsClient />
    </Suspense>
  );
}
