"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStorePointsView } from "@/components/business/owner/OwnerStorePointsView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function OwnerStorePointsPageInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";

  if (!storeId) {
    return <p className="text-sm text-sam-muted">{t("store_owner_settlement_pick_store_body")}</p>;
  }

  return <OwnerStorePointsView storeId={storeId} />;
}

export default function OwnerStorePointsPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-1">
        <OwnerStorePointsPageInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
