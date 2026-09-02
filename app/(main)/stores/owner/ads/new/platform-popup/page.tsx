"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerPlatformPopupApplyView } from "@/components/business/owner/ads/OwnerPlatformPopupApplyView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { OwnerStoreSupportShell } from "@/components/support/OwnerStoreSupportShell";

export default function OwnerPlatformPopupCreatePage() {
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
          sourceSurface="owner_platform_popup_compose"
        >
          <OwnerPlatformPopupApplyView />
        </OwnerStoreSupportShell>
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
