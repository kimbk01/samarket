"use client";

/** /admin/stores/orders/[orderId] — direct access / shared link. Same content as the detail modal. */
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminOrderDetailView } from "@/components/admin/store-orders/AdminOrderDetailView";
import { useAdminStoreOrderRowRealtime } from "@/hooks/admin/useAdminStoreOrderRowRealtime";
import { parseAdminOrderDetailSection } from "@/lib/admin/store-orders/admin-store-order-detail-contract";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function AdminOrderDetailPage({ orderId }: { orderId: string }) {
  const section = parseAdminOrderDetailSection(useSearchParams().get("section"));
  const [reloadKey, setReloadKey] = useState(0);
  // Store/buyer changes while the page is open → reload (same as the previous detail page).
  useAdminStoreOrderRowRealtime(orderId.trim() || null, { debounceMs: 400, onChange: () => setReloadKey((k) => k + 1) });
  return (
    <div className="space-y-3 p-4 md:p-6">
      <AdminPageHeader titleKey="admin_do_detail_title" backHref="/admin/stores/orders" />
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface">
        <AdminOrderDetailView orderId={orderId} initialSection={section} fullPage reloadSignal={reloadKey} />
      </div>
    </div>
  );
}
