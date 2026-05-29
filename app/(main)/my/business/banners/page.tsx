"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreBannersView } from "@/components/business/owner/OwnerStoreBannersView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

export default function OwnerStoreBannersPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell>
        <OwnerStoreBannersView />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
