"use client";

import { Suspense } from "react";
import { AdminGiftCashOutsPage } from "@/components/admin/gift/AdminGiftCashOutsPage";

export default function AdminGiftCashOutsRoutePage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-sam-muted">…</div>}>
      <AdminGiftCashOutsPage />
    </Suspense>
  );
}
