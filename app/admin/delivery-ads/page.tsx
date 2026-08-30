"use client";

import { Suspense } from "react";
import { AdminDeliveryAdsControlPlane } from "@/components/admin/stores/AdminDeliveryAdsControlPlane";

export default function AdminDeliveryAdsHubPage() {
  return (
    <Suspense fallback={null}>
      <AdminDeliveryAdsControlPlane />
    </Suspense>
  );
}
