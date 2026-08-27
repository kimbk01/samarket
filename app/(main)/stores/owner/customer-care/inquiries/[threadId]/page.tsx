"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { MemberCsNoteThreadClient } from "@/components/mypage/cs/MemberCsNoteThreadClient";

function Inner() {
  return (
    <MemberCsNoteThreadClient
      kind="inquiry"
      listBasePath="/stores/owner/customer-care/inquiries"
      hideChrome
    />
  );
}

export default function OwnerCustomerCareCsInquiryThreadPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-1">
        <Inner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
