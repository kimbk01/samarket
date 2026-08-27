"use client";

import { Suspense } from "react";
import { AdminGiftOpsCenter } from "@/components/admin/gift/AdminGiftOpsCenter";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-sm text-sam-muted">
          Loading gift operations…
        </div>
      }
    >
      <AdminGiftOpsCenter />
    </Suspense>
  );
}
