"use client";

import { Suspense } from "react";
import { RouteLoadingInline } from "@/components/i18n/RouteLoadingInline";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreSettlementsView } from "@/components/business/owner/OwnerStoreSettlementsView";

export default function MyBusinessSettlementsRoute() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell>
          <RouteLoadingInline className="sam-text-body text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell>
        <OwnerStoreSettlementsView />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
