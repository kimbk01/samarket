"use client";

import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreNotificationSettingsView } from "@/components/business/owner/OwnerStoreNotificationSettingsView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { OwnerSubpageDetailHeader } from "@/components/stores/owner/OwnerSubpageDetailHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";

function OwnerNotificationSettingsPageInner() {
  const { t } = useI18n();
  const searchParams = useOwnerAdminUrlSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";
  return (
    <>
      <OwnerSubpageDetailHeader
        title={t("store_owner_notification_settings_title")}
        backHref={OwnerRoutes.notifications(storeId || null)}
      />
      <div className="mx-auto max-w-3xl px-1 pt-1">
        <OwnerStoreNotificationSettingsView />
      </div>
    </>
  );
}

export default function OwnerStoreNotificationSettingsPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell className="pt-1">
        <OwnerNotificationSettingsPageInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
