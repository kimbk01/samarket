"use client";

import { Suspense } from "react";
import { OwnerStoreOrdersView } from "@/components/business/owner/OwnerStoreOrdersView";
import { OwnerTabSkeleton } from "@/components/business/owner/OwnerTabSkeleton";

export default function OwnerStoreOrdersPage() {
  return (
    <Suspense
      fallback={
        <div>
          <OwnerTabSkeleton kind="orders" />
        </div>
      }
    >
      <OwnerStoreOrdersView />
    </Suspense>
  );
}
