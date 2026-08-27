"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { OwnerCareAdminNotesThread } from "@/components/business/owner/OwnerCareAdminNotesThread";

export default function OwnerCustomerCareMessageThreadPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-1">
        <OwnerCareAdminNotesThread kind="inbox" />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
