import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminOrderOpsScreen } from "@/components/admin/store-orders/AdminOrderOpsScreen";

export default async function AdminStoreOrdersByBuyerPage({
  params,
}: {
  params: Promise<{ buyerUserId: string }>;
}) {
  const { buyerUserId } = await params;
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <AdminOrderOpsScreen screen="list" fixed={{ buyerUserId }} />
    </Suspense>
  );
}
