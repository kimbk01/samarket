import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { DeliveryRefundsClient } from "@/components/admin/delivery-orders/DeliveryRefundsClient";

export default function AdminStoreOrderRefundsPage() {
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <DeliveryRefundsClient />
    </Suspense>
  );
}
