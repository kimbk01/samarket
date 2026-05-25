"use client";

import type { BusinessProfile } from "@/lib/types/business";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  STORE_APPROVAL_STATUS_KEYS,
  STORE_SALES_STATUS_KEYS,
} from "@/lib/business/business-owner-ui-labels";

export function BusinessOwnerOpsStrip({
  row,
  profile,
  canSell,
}: {
  row: StoreRow;
  profile: BusinessProfile;
  canSell: boolean;
}) {
  const { t } = useI18n();
  const approval = row.approval_status ?? "";
  const sales = row.sales_permission?.sales_status ?? "pending";
  const visible = row.is_visible === true;

  const approvalLabelKey = STORE_APPROVAL_STATUS_KEYS[approval];
  const salesLabelKey = STORE_SALES_STATUS_KEYS[sales];

  return (
    <section
      className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm"
      aria-label={t("business_phase7_078")}
    >
      <h2 className="sam-text-body-secondary font-semibold text-sam-muted">{t("business_phase7_226")}</h2>
      <dl className="mt-3 space-y-2 sam-text-body-secondary text-sam-fg">
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-sam-muted">{t("business_phase7_074")}</dt>
          <dd className="text-right font-medium">
            {approvalLabelKey ? t(approvalLabelKey) : approval}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-sam-muted">{t("business_phase7_024")}</dt>
          <dd className="text-right font-medium">
            {visible ? t("business_phase7_663") : t("business_phase7_132")}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="shrink-0 text-sam-muted">{t("business_phase7_311")}</dt>
          <dd className="text-right font-medium">
            {canSell ? t("business_phase7_664") : salesLabelKey ? t(salesLabelKey) : sales}
          </dd>
        </div>
        {(profile.storeCategoryName || profile.storeTopicName) && (
          <div className="flex justify-between gap-3 border-t border-sam-border-soft pt-2">
            <dt className="shrink-0 text-sam-muted">{t("business_phase7_320")}</dt>
            <dd className="text-right">
              {[profile.storeCategoryName, profile.storeTopicName].filter(Boolean).join(" · ")}
            </dd>
          </div>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-sam-border-soft pt-2 sam-text-helper text-sam-muted">
          {row.delivery_available === true && <span>{t("business_phase7_106")}</span>}
          {row.pickup_available !== false && <span>{t("business_phase7_315")}</span>}
          {row.delivery_available !== true && row.pickup_available === false && (
            <span>{t("business_phase7_160")}</span>
          )}
        </div>
      </dl>
    </section>
  );
}
