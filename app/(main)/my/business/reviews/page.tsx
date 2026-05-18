"use client";

import { Suspense } from "react";
import { OwnerStoreReviewsView } from "@/components/business/owner/OwnerStoreReviewsView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

export default function OwnerStoreReviewsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </div>
      }
    >
      <OwnerStoreReviewsView />
    </Suspense>
  );
}
