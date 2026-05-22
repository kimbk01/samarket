"use client";

import { Suspense } from "react";
import { OwnerStoreNoticesView } from "@/components/business/owner/OwnerStoreNoticesView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

export default function OwnerStoreNoticesPage() {
  return (
    <Suspense
      fallback={
        <div className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </div>
      }
    >
      <OwnerStoreNoticesView />
    </Suspense>
  );
}
