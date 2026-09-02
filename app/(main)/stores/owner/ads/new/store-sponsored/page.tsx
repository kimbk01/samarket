"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreSponsoredCreateView } from "@/components/business/owner/ads/OwnerStoreSponsoredCreateView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { OwnerStoreSupportShell } from "@/components/support/OwnerStoreSupportShell";

export default function OwnerStoreSponsoredCreatePage() {
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
          sourceSurface="owner_delivery_ad_compose"
        >
          <OwnerStoreSponsoredCreateView />
        </OwnerStoreSupportShell>
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
