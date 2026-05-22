"use client";

import { Suspense } from "react";
import { OwnerStoreBannersView } from "@/components/business/owner/OwnerStoreBannersView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

export default function OwnerStoreBannersPage() {
  return (
    <Suspense
      fallback={
        <div className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </div>
      }
    >
      <OwnerStoreBannersView />
    </Suspense>
  );
}
