"use client";

import { Suspense } from "react";
import { OwnerStoreOrdersView } from "@/components/business/owner/OwnerStoreOrdersView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

export default function OwnerStoreOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </div>
      }
    >
      <OwnerStoreOrdersView />
    </Suspense>
  );
}
