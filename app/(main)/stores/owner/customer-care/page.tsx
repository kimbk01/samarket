"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerCustomerCareHubView } from "@/components/business/owner/OwnerCustomerCareHubView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

export default function OwnerCustomerCarePage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-1">
        <OwnerCustomerCareHubView />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
