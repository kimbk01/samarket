"use client";

import { Suspense } from "react";
import { OwnerStoreOrdersView } from "@/components/business/owner/OwnerStoreOrdersView";

export default function OwnerStoreOrdersPage() {
  return (
    <Suspense fallback={<p className="px-4 pt-4 text-sm text-gray-500">불러오는 중…</p>}>
      <OwnerStoreOrdersView />
    </Suspense>
  );
}
