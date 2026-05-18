"use client";

import { Suspense } from "react";
import { OwnerStoreInquiriesView } from "@/components/business/owner/OwnerStoreInquiriesView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

export default function OwnerStoreInquiriesPage() {
  return (
    <div className="pt-1">
      <Suspense
        fallback={
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        }
      >
        <OwnerStoreInquiriesView />
      </Suspense>
    </div>
  );
}
