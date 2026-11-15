"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerCustomerCareHubView } from "@/components/business/owner/OwnerCustomerCareHubView";
import { OwnerTabSkeleton } from "@/components/business/owner/OwnerTabSkeleton";

export default function OwnerCustomerCarePage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell padForOwnerBottomNav={false}>
          <OwnerTabSkeleton kind="customers" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-1">
        <OwnerCustomerCareHubView />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
