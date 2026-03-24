"use client";

import { Suspense } from "react";
import { BusinessSubPageHeader } from "@/components/business/BusinessSubPageHeader";
import { OwnerStoreInquiriesView } from "@/components/business/owner/OwnerStoreInquiriesView";

export default function OwnerStoreInquiriesPage() {
  return (
    <>
      <BusinessSubPageHeader title="받은 문의" backHref="/my/business" />
      <div className="px-4 pt-4">
        <Suspense fallback={<p className="text-sm text-gray-500">불러오는 중…</p>}>
          <OwnerStoreInquiriesView />
        </Suspense>
      </div>
    </>
  );
}
