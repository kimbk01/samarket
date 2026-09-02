"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerPlatformPopupRequestDetailView } from "@/components/business/owner/ads/OwnerPlatformPopupRequestDetailView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { OwnerStoreSupportShell } from "@/components/support/OwnerStoreSupportShell";

export default function OwnerPlatformPopupRequestDetailPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell>
        <OwnerStoreSupportShell
          category="DELIVERY_AD"
          sourceSurface="owner_platform_popup_detail"
        >
          <OwnerPlatformPopupRequestDetailView />
        </OwnerStoreSupportShell>
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
