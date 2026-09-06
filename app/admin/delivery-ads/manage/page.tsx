"use client";

import { Suspense } from "react";
import { AdminDeliveryAdsControlPlane } from "@/components/admin/stores/AdminDeliveryAdsControlPlane";

/**
 * Delivery 매장 홍보 + 배달 배너 — sole operator list/execution path.
 * Cross-domain Control Plane is NOT mounted here (dual-stack removal).
 */
export default function AdminDeliveryAdsManagePage() {
  return (
    <Suspense fallback={null}>
      <AdminDeliveryAdsControlPlane />
    </Suspense>
  );
}
