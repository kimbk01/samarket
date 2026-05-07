"use client";

import { Suspense } from "react";
import { OwnerStoreNoticesView } from "@/components/business/owner/OwnerStoreNoticesView";

export default function OwnerStoreNoticesPage() {
  return (
    <Suspense fallback={<p className="px-4 pt-4 text-sm text-sam-muted">불러오는 중…</p>}>
      <OwnerStoreNoticesView />
    </Suspense>
  );
}
