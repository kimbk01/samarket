"use client";

import { Suspense } from "react";
import { OwnerStoreSettlementsView } from "@/components/business/owner/OwnerStoreSettlementsView";

export default function MyBusinessSettlementsRoute() {
  return (
    <Suspense fallback={<p className="sam-text-body text-sam-muted">불러오는 중…</p>}>
      <OwnerStoreSettlementsView />
    </Suspense>
  );
}
