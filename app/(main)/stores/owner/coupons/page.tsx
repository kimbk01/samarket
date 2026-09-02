"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreCouponsView } from "@/components/business/owner/OwnerStoreCouponsView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { OwnerStoreSupportShell } from "@/components/support/OwnerStoreSupportShell";

export default function OwnerStoreCouponsPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell>
        <OwnerStoreSupportShell category="COUPON" sourceSurface="owner_coupons">
          <OwnerStoreCouponsView />
        </OwnerStoreSupportShell>
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
