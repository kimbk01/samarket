"use client";

import { Suspense } from "react";
import { AdminGiftOpsCenter } from "@/components/admin/gift/AdminGiftOpsCenter";
import { AdminLoadingFallbackSm } from "@/components/admin/AdminLoadingFallback";

export default function Page() {
  return (
    <Suspense fallback={<AdminLoadingFallbackSm />}>
      <AdminGiftOpsCenter />
    </Suspense>
  );
}
