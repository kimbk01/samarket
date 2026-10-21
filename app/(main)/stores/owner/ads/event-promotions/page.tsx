"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerEventPromotionListClient } from "@/components/business/owner/ads/OwnerEventPromotionListClient";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { useBusinessAdminStore } from "@/components/business/admin/business-admin-store-context";

/**
 * IA-08 — 매장 = URL `?storeId=` → 없으면 셸 `selectedRow`(셸이 URL 도 정규화). `stores[0]` 금지.
 */
function OwnerEventPromotionListInner() {
  const searchParams = useSearchParams();
  const biz = useBusinessAdminStore();
  const storeId = searchParams.get("storeId")?.trim() || biz?.storeRow?.id?.trim() || "";
  if (!storeId) {
    return <OwnerStoreSuspenseFallback className="p-4 text-sm text-sam-muted" />;
  }
  return <OwnerEventPromotionListClient storeId={storeId} />;
}

export default function OwnerEventPromotionsPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell>
        <OwnerEventPromotionListInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
