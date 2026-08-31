"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DELIVERY_AD_OWNER_PACKAGE_CARD_IDLE,
  DELIVERY_AD_OWNER_PACKAGE_CARD_SELECTED,
} from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

export type DeliveryAdOwnerPackageCardItem = {
  packageId: string;
  durationDays: number;
  finalPayableDisplay: string;
  finalPayableMinor?: number;
  displayName?: string;
};

export function DeliveryAdOwnerPackageCardGrid({
  packages,
  selectedPackageId,
  onSelect,
  preparing,
}: {
  packages: DeliveryAdOwnerPackageCardItem[];
  selectedPackageId: string;
  onSelect: (packageId: string) => void;
  preparing?: boolean;
}) {
  const { t } = useI18n();

  if (preparing || packages.length === 0) {
    return (
      <div className="grid grid-cols-3 gap-2" data-owner-ads-packages="preparing" role="status">
        {[7, 15, 30].map((days) => (
          <div
            key={days}
            className="flex min-h-[96px] flex-col items-center justify-center rounded-ui-rect border border-dashed border-[#BDBDBD] bg-[#F5F5F5] px-2 py-3 text-center opacity-70"
          >
            <span className="text-[12px] font-semibold text-[#757575]">
              {t("owner_ads_period_duration_days").replace("{days}", String(days))}
            </span>
            <span className="mt-1 text-[11px] font-medium text-[#757575]">
              {t("owner_ads_package_sale_preparing")}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2" data-owner-ads-package-grid="design-board">
      {packages.map((pkg) => {
        const selected = selectedPackageId === pkg.packageId;
        const dailyMinor =
          pkg.finalPayableMinor && pkg.durationDays > 0
            ? Math.floor(pkg.finalPayableMinor / pkg.durationDays)
            : null;
        const dailyLabel =
          dailyMinor != null && dailyMinor > 0
            ? t("owner_ads_package_daily_avg").replace(
                "{amount}",
                formatDeliveryAdPhpMinor(dailyMinor)
              )
            : null;
        return (
          <button
            key={pkg.packageId}
            type="button"
            className={`flex min-h-[96px] flex-col items-center justify-center rounded-ui-rect border px-2 py-3 text-center transition ${
              selected
                ? DELIVERY_AD_OWNER_PACKAGE_CARD_SELECTED
                : DELIVERY_AD_OWNER_PACKAGE_CARD_IDLE
            }`}
            onClick={() => onSelect(pkg.packageId)}
            aria-pressed={selected}
            data-owner-ads-package-id={pkg.packageId}
          >
            <span className="text-[12px] font-semibold text-sam-fg">
              {t("owner_ads_period_duration_days").replace("{days}", String(pkg.durationDays))}
            </span>
            <span
              className={`mt-1 text-[15px] font-bold tabular-nums ${
                selected ? "text-[#0A823E]" : "text-sam-fg"
              }`}
            >
              {pkg.finalPayableDisplay}
            </span>
            {dailyLabel ? (
              <span className="mt-0.5 text-[10px] font-medium text-[#757575]">{dailyLabel}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
