"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { MemberCsNoteListClient } from "@/components/mypage/cs/MemberCsNoteListClient";
import { OwnerRoutes } from "@/lib/business/owner-routes";

function OwnerCareMessagesInner() {
  const sp = useSearchParams();
  const storeId = sp.get("storeId");
  const listBasePath = OwnerRoutes.customerCareMessages(storeId).split("?")[0]!;
  return <MemberCsNoteListClient kind="inbox" listBasePath={listBasePath} hideChrome />;
}

export default function OwnerCustomerCareMessagesPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-1">
        <OwnerCareMessagesInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
