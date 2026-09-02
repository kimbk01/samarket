"use client";

import { Suspense } from "react";
import { MemberSupportHistoryClient } from "@/components/support/MemberSupportHistoryClient";

export default function MypageSupportHistoryPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-sam-muted">…</div>}>
      <MemberSupportHistoryClient />
    </Suspense>
  );
}
