"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DELIVERY_AD_DESIGN_BOARD } from "@/lib/stores/advertising/delivery-ad-design-board-contract";

/** Design board — 커스텀 기간 카드 (R1: 패키지 기간 표시, 커스텀 선택 UI 동일) */
export function DeliveryAdOwnerCustomPeriodBoard({
  durationDays,
  selected,
}: {
  durationDays: number | null;
  selected?: boolean;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      disabled
      className={`mt-3 flex w-full items-center gap-3 rounded-ui-rect border px-3 py-3 text-left ${
        selected
          ? "border-[#0A823E] bg-[#0A823E]/8 ring-1 ring-[#0A823E]/40"
          : "border-[#BDBDBD] bg-white opacity-80"
      }`}
      data-owner-ads-custom-period="design-board"
      aria-disabled
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-rect bg-[#F5F5F5] text-[#757575]"
        aria-hidden
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-sam-fg">{t("owner_ads_custom_period_title")}</p>
        {durationDays ? (
          <p className="mt-1 text-[12px] text-[#757575]">
            {t("owner_ads_custom_period_selected").replace("{days}", String(durationDays))}
          </p>
        ) : (
          <p className="mt-1 text-[12px] text-[#757575]">{t("owner_ads_custom_period_hint")}</p>
        )}
      </div>
    </button>
  );
}

void DELIVERY_AD_DESIGN_BOARD;
