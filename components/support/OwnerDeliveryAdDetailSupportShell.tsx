"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerDeliveryAdDetailView } from "@/components/business/owner/ads/OwnerDeliveryAdDetailView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { OwnerStoreSupportShell } from "@/components/support/OwnerStoreSupportShell";

export function OwnerDeliveryAdDetailSupportShell({
  campaignId,
}: {
  campaignId: string;
}) {
  return (
    <OwnerStoreSupportShell
      category="DELIVERY_AD"
      sourceSurface="owner_delivery_ad_detail"
      referenceType="AD_CAMPAIGN"
      referenceId={campaignId}
    >
      <OwnerDeliveryAdDetailView campaignId={campaignId} />
    </OwnerStoreSupportShell>
  );
}

export function OwnerDeliveryAdDetailPageBody({
  campaignId,
}: {
  campaignId: string;
}) {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell>
        <OwnerDeliveryAdDetailSupportShell campaignId={campaignId} />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
