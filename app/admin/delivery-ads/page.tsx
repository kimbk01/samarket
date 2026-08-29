"use client";

import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * CUT B route ownership stub — Admin Delivery ads hub.
 * Unified control plane UX = CUT F.
 */
export default function AdminDeliveryAdsHubPage() {
  const { t } = useI18n();
  return (
    <AdminDeliveryCmsChrome help="home">
      <div className="space-y-4">
        <div>
          <p className="text-[12px] text-sam-muted">Delivery › Ads</p>
          <h1 className="text-[20px] font-bold text-sam-fg">{t("admin_delivery_ads_stub_title")}</h1>
        </div>
        <AdminCard titleKey="admin_delivery_ads_stub_title">
          <p className="text-[13px] text-sam-muted">{t("admin_delivery_ads_stub_body")}</p>
        </AdminCard>
      </div>
    </AdminDeliveryCmsChrome>
  );
}
