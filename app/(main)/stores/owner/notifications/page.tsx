"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreNotificationsView } from "@/components/business/owner/OwnerStoreNotificationsView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { OwnerSubpageDetailHeader } from "@/components/stores/owner/OwnerSubpageDetailHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";

function OwnerNotificationsPageInner() {
  const { t } = useI18n();
  const searchParams = useOwnerAdminUrlSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";
  return (
    <>
      <OwnerSubpageDetailHeader
        title={t("store_owner_notifications_title")}
        backHref={OwnerRoutes.hub(storeId || null)}
      />
      <OwnerStoreNotificationsView />
    </>
  );
}

export default function OwnerStoreNotificationsPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell className="pt-1">
        <OwnerNotificationsPageInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
