import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminStoreOrdersPage } from "@/components/admin/stores/AdminStoreOrdersPage";

export default async function AdminStoreOrdersRoutePage({
  searchParams,
}: {
  searchParams?: Promise<{ order_id?: string; store_id?: string; order_status?: string; queue?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const orderId = typeof sp?.order_id === "string" ? sp.order_id.trim() : "";
  const storeId = typeof sp?.store_id === "string" ? sp.store_id.trim() : "";
  // Admin Action Queue deep-link (`orders_attention`) → UI sentinel; else an explicit status filter.
  const orderStatus =
    sp?.queue === "admin_attention"
      ? "__admin_queue"
      : typeof sp?.order_status === "string"
        ? sp.order_status.trim()
        : "";

  return (
    <div className="p-4 md:p-6">
      <Suspense fallback={<AdminLoadingFallbackSm />}>
        <AdminStoreOrdersPage
          initialFilters={{
            ...(orderId ? { orderId } : {}),
            ...(storeId ? { storeId } : {}),
            ...(orderStatus ? { orderStatus } : {}),
          }}
        />
      </Suspense>
    </div>
  );
}
