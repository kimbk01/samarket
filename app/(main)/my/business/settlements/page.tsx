"use client";

import { Suspense } from "react";
import { RouteLoadingInline } from "@/components/i18n/RouteLoadingInline";
import { OwnerStoreSettlementsView } from "@/components/business/owner/OwnerStoreSettlementsView";

export default function MyBusinessSettlementsRoute() {
  return (
    <Suspense fallback={<RouteLoadingInline className="sam-text-body text-sam-muted" />}>
      <OwnerStoreSettlementsView />
    </Suspense>
  );
}
