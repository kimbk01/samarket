"use client";

import { Suspense } from "react";
import { AdminGiftApplicationsPage } from "@/components/admin/gift/AdminGiftApplicationsPage";

export default function AdminGiftApplicationsRoutePage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-sam-muted">…</div>}>
      <AdminGiftApplicationsPage />
    </Suspense>
  );
}
