"use client";

import { Suspense } from "react";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerBusinessCashView } from "@/components/business/owner/OwnerBusinessCashView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function OwnerBusinessCashPageInner() {
  const { t, safeT } = useI18n();
  const searchParams = useOwnerAdminUrlSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";

  if (!storeId) {
    return <p className="text-sm text-sam-muted">{t("store_owner_settlement_pick_store_body")}</p>;
  }

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-sam-fg">
        {safeT("owner_bc_page_title", {
          fallbackKo: "Business Cash",
          fallbackEn: "Business Cash",
        })}
      </h1>
      <OwnerBusinessCashView storeId={storeId} />
    </div>
  );
}

export default function OwnerBusinessCashPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell className="pt-1">
        <OwnerBusinessCashPageInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
