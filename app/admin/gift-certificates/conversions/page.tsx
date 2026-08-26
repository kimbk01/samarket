"use client";

import { Suspense } from "react";
import { AdminGiftConversionsPage } from "@/components/admin/gift/AdminGiftConversionsPage";

export default function AdminGiftConversionsRoutePage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-sam-muted">…</div>}>
      <AdminGiftConversionsPage />
    </Suspense>
  );
}
