"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreNotificationSettingsView } from "@/components/business/owner/OwnerStoreNotificationSettingsView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

function OwnerNotificationSettingsPageInner() {
  return (
    <div className="mx-auto max-w-3xl px-1 pt-1">
      <OwnerStoreNotificationSettingsView />
    </div>
  );
}

export default function OwnerStoreNotificationSettingsPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell className="pt-1">
        <OwnerNotificationSettingsPageInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
