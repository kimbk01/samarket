import { Suspense } from "react";
import { AdminAdsDirectDeliveryCreateView } from "@/components/admin/ads/AdminAdsDirectDeliveryCreateView";

export default function AdminAdsDirectDeliveryPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-sam-muted">…</div>}>
      <AdminAdsDirectDeliveryCreateView />
    </Suspense>
  );
}
