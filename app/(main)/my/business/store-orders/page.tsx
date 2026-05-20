"use client";

import { Suspense } from "react";
import { OwnerStoreOrdersPageFallback } from "@/components/business/owner/OwnerStoreOrdersPageFallback";
import { OwnerStoreOrdersView } from "@/components/business/owner/OwnerStoreOrdersView";

export default function OwnerStoreOrdersPage() {
  return (
    <Suspense fallback={<OwnerStoreOrdersPageFallback />}>
      <OwnerStoreOrdersView />
    </Suspense>
  );
}
