"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreInquiriesView } from "@/components/business/owner/OwnerStoreInquiriesView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

export default function OwnerStoreInquiriesPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell className="pt-1">
        <OwnerStoreInquiriesView />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
