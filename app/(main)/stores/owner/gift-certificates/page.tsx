"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerGiftCertificatesView } from "@/components/business/owner/OwnerGiftCertificatesView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { OwnerStoreSupportShell } from "@/components/support/OwnerStoreSupportShell";

export default function OwnerGiftCertificatesPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell>
        <OwnerStoreSupportShell category="GIFT_CERTIFICATE" sourceSurface="owner_gift_certificates">
          <OwnerGiftCertificatesView />
        </OwnerStoreSupportShell>
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
