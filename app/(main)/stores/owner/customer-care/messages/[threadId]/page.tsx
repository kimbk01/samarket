"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { MemberCsNoteThreadClient } from "@/components/mypage/cs/MemberCsNoteThreadClient";
import { OwnerRoutes } from "@/lib/business/owner-routes";

function Inner() {
  const sp = useSearchParams();
  const storeId = sp.get("storeId");
  const listBasePath = OwnerRoutes.customerCareMessages(storeId).split("?")[0]!;
  return <MemberCsNoteThreadClient kind="inbox" listBasePath={listBasePath} hideChrome />;
}

export default function OwnerCustomerCareMessageThreadPage() {
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
