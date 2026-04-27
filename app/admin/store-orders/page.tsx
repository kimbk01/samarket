import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminStoreOrdersPage } from "@/components/admin/stores/AdminStoreOrdersPage";

export default async function AdminStoreOrdersRoutePage({
  searchParams,
}: {
  searchParams?: Promise<{ order_id?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const orderId = typeof sp?.order_id === "string" ? sp.order_id.trim() : "";

  return (
    <div className="p-4 md:p-6">
      <Suspense fallback={<AdminLoadingFallbackSm />}>
        <AdminStoreOrdersPage initialFilters={orderId ? { orderId } : undefined} />
      </Suspense>
    </div>
  );
}
