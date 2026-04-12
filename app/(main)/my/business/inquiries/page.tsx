"use client";

import { Suspense } from "react";
import { OwnerStoreInquiriesView } from "@/components/business/owner/OwnerStoreInquiriesView";

export default function OwnerStoreInquiriesPage() {
  return (
    <div className="pt-1">
      <Suspense fallback={<p className="text-sm text-sam-muted">불러오는 중…</p>}>
        <OwnerStoreInquiriesView />
      </Suspense>
    </div>
  );
}
