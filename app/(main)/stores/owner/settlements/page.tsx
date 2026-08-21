"use client";

import { Suspense } from "react";
import { RouteLoadingInline } from "@/components/i18n/RouteLoadingInline";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreSettlementsView } from "@/components/business/owner/OwnerStoreSettlementsView";

export default function OwnerStoreSettlementsPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <RouteLoadingInline className="sam-text-body text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell className="pt-1">
        <OwnerStoreSettlementsView />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
