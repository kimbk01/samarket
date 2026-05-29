"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreReviewsView } from "@/components/business/owner/OwnerStoreReviewsView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

export default function OwnerStoreReviewsPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell>
        <OwnerStoreReviewsView />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
