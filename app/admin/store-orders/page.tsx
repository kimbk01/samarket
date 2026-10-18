import { Suspense } from "react";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";
import { AdminStoreOrdersPage } from "@/components/admin/stores/AdminStoreOrdersPage";

/**
 * 관리자 매장 주문 조회. Filters/page live in the URL (`parseAdminStoreOrdersQuery`), so
 * existing deep links (`order_id`, `store_id`, `buyer_user_id`, `queue=admin_attention`,
 * `order_status`) keep working.
 */
export default function AdminStoreOrdersRoutePage() {
  return (
    <div className="p-4 md:p-6">
      <Suspense fallback={<AdminLoadingFallbackSm />}>
        <AdminStoreOrdersPage />
      </Suspense>
    </div>
  );
}
