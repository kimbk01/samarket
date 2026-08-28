"use client";

import { Suspense } from "react";
import { CommerceHubChromeSyncGate } from "./CommerceHubChromeSync";
import { CustomerCommerceHubBody } from "./CustomerCommerceHubBody";
import { CommerceHubLegacyUrlSync } from "./CommerceHubLegacyUrlSync";

function HubFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-sam-muted">…</div>
  );
}

/** Shared hub entry — thin alias pages render this only (G2). */
export function CustomerCommerceHubPage({
  legacyAlias = "activity",
}: {
  legacyAlias?: "orders" | "coupons" | "gifts" | "activity";
}) {
  return (
    <>
      <Suspense fallback={null}>
        <CommerceHubLegacyUrlSync alias={legacyAlias} />
      </Suspense>
      <CommerceHubChromeSyncGate />
      <Suspense fallback={<HubFallback />}>
        <CustomerCommerceHubBody />
      </Suspense>
    </>
  );
}
