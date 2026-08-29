"use client";

import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * CUT B route ownership stub — Owner Delivery ads hub.
 * Full application UX = CUT C.
 */
export default function OwnerDeliveryAdsHubPage() {
  const { t } = useI18n();
  return (
    <OwnerAdminPageScrollShell className="space-y-3 p-4">
      <h1 className="text-[18px] font-bold text-sam-fg">
        {t("owner_delivery_ads_hub_title")}
      </h1>
      <p className="text-[13px] text-sam-muted">
        {t("owner_delivery_ads_hub_stub")}
      </p>
    </OwnerAdminPageScrollShell>
  );
}
