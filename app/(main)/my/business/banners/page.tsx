"use client";

import { Suspense } from "react";
import { OwnerStoreBannersView } from "@/components/business/owner/OwnerStoreBannersView";

export default function OwnerStoreBannersPage() {
  return (
    <Suspense fallback={<p className="px-4 pt-4 text-sm text-sam-muted">불러오는 중…</p>}>
      <OwnerStoreBannersView />
    </Suspense>
  );
}
