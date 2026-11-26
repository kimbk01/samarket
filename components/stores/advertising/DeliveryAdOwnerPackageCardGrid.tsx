"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DELIVERY_AD_OWNER_PACKAGE_CARD_IDLE,
  DELIVERY_AD_OWNER_PACKAGE_CARD_SELECTED,
} from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

function formatDailyAvg(minor: number, days: number): string {
  if (days <= 0) return formatDeliveryAdPhpMinor(minor);
  return formatDeliveryAdPhpMinor(Math.round(minor / days));
}

export type DeliveryAdOwnerPackageCardItem = {
  packageId: string;
  durationDays: number;
  finalPayableDisplay: string;
  finalPayableMinor?: number;
  basePriceDisplay?: string;
  partnerDiscountPercent?: number;
  partnerActive?: boolean;
  displayName?: string;
  /** Server quote: partner discount amount display (optional). */
  partnerDiscountDisplay?: string;
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

  /**
   * 광고 감사 SA-10 (2026-11-26): 판매 중인 기간이 없으면 한 줄 안내만 — 예전에는 7·15·30일 카드를 코드로 그려
   * 어드민이 기간을 바꿔도 「7일 · 판매 준비 중」처럼 실제와 다른 기간이 보였다.
   */
  if (preparing || packages.length === 0) {
    return (
      <div
        className="flex min-h-[64px] items-center justify-center rounded-ui-rect border border-dashed border-sam-border bg-sam-app px-3 py-3 text-center"
        data-owner-ads-packages="preparing"
        role="status"
      >
        <span className="text-[13px] font-medium text-sam-muted">{t("owner_ads_package_sale_preparing")}</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2" data-owner-ads-package-grid="design-board">
      {packages.map((pkg) => {
        const selected = selectedPackageId === pkg.packageId;
        const showPartner =
          pkg.partnerActive && (pkg.partnerDiscountPercent ?? 0) > 0 && pkg.basePriceDisplay;
        return (
          <button
            key={pkg.packageId}
            type="button"
            className={`flex min-h-[110px] flex-col items-center justify-center rounded-ui-rect border px-2 py-3 text-center transition hover:border-sam-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sam-primary/40 active:scale-[0.99] ${
              selected
                ? DELIVERY_AD_OWNER_PACKAGE_CARD_SELECTED
                : DELIVERY_AD_OWNER_PACKAGE_CARD_IDLE
            }`}
            onClick={() => onSelect(pkg.packageId)}
            aria-pressed={selected}
            data-owner-ads-package-id={pkg.packageId}
            data-owner-ads-period-card="1"
          >
            <span className="text-[12px] font-semibold text-sam-fg">
              {t("owner_ads_period_duration_days", { days: pkg.durationDays })}
            </span>
            {showPartner && pkg.basePriceDisplay ? (
              <span className="mt-0.5 text-[10px] text-[#757575] line-through tabular-nums">
                {pkg.basePriceDisplay}
              </span>
            ) : null}
            <span
              className={`mt-0.5 text-[15px] font-bold tabular-nums ${
                selected ? "text-sam-primary" : "text-sam-fg"
              }`}
            >
              {pkg.finalPayableDisplay}
            </span>
            {pkg.durationDays > 0 && pkg.finalPayableMinor != null && pkg.finalPayableMinor > 0 ? (
              <span className="mt-0.5 text-[10px] text-[#757575] tabular-nums">
                {t("owner_ads_package_daily_avg", {
                  amount: formatDailyAvg(pkg.finalPayableMinor, pkg.durationDays),
                })}
              </span>
            ) : null}
            {showPartner ? (
              <span className="mt-0.5 text-[10px] font-medium text-sam-primary">
                {t("owner_ads_confirm_partner_discount")} {pkg.partnerDiscountPercent}%
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
