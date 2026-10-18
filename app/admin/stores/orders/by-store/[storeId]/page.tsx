import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminOrderOpsScreen } from "@/components/admin/store-orders/AdminOrderOpsScreen";

export default async function AdminStoreOrdersByStorePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <AdminOrderOpsScreen screen="list" fixed={{ storeId }} />
    </Suspense>
  );
}
