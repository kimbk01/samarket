"use client";

import { Suspense } from "react";
import { OwnerStoreReviewsView } from "@/components/business/owner/OwnerStoreReviewsView";

export default function OwnerStoreReviewsPage() {
  return (
    <Suspense fallback={<p className="px-4 pt-4 text-sm text-sam-muted">불러오는 중…</p>}>
      <OwnerStoreReviewsView />
    </Suspense>
  );
}
