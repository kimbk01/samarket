"use client";

import { Suspense } from "react";
import { AdminDeliveryAdCommercialSettingsView } from "@/components/admin/stores/AdminDeliveryAdCommercialSettingsView";

export default function AdminDeliveryAdsCommercialSettingsPage() {
  return (
    <Suspense fallback={null}>
      <AdminDeliveryAdCommercialSettingsView />
    </Suspense>
  );
}
