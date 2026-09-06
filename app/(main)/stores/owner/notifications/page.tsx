"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreNotificationsView } from "@/components/business/owner/OwnerStoreNotificationsView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

function OwnerNotificationsPageInner() {
  return <OwnerStoreNotificationsView />;
}

export default function OwnerStoreNotificationsPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell className="pt-1">
        <OwnerNotificationsPageInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
