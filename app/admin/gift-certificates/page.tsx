"use client";

import { Suspense } from "react";
import { AdminGiftOpsCenter } from "@/components/admin/gift/AdminGiftOpsCenter";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-sm text-sam-muted">
          불러오는 중…
        </div>
      }
    >
      <AdminGiftOpsCenter />
    </Suspense>
  );
}
