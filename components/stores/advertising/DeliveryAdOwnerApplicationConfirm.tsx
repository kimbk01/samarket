"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DELIVERY_AD_OWNER_CONFIRM_TIMELINE } from "@/lib/stores/advertising/delivery-ad-design-board-contract";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

export type DeliveryAdOwnerApplicationConfirmRow = {
  labelKey: string;
  value: string;
};

type CashBreakdown = {
  adAmountMinor: number;
  balanceMinor: number;
};

/** Design board screen 5 — 신청 확인 summary + Business Cash numbers + timeline */
export function DeliveryAdOwnerApplicationConfirm({
  rows,
  totalDisplay,
  businessCashNoteKey = "owner_ads_confirm_business_cash_note",
  cashBreakdown = null,
}: {
  rows: DeliveryAdOwnerApplicationConfirmRow[];
  totalDisplay: string | null;
  businessCashNoteKey?: string;
  cashBreakdown?: CashBreakdown | null;
}) {
  const { t, safeT } = useI18n();
  if (!totalDisplay) return null;

  const afterPayMinor =
    cashBreakdown != null
      ? cashBreakdown.balanceMinor - cashBreakdown.adAmountMinor
      : null;

  return (
    <div data-owner-ads-confirm="design-board">
      <dl className="space-y-2 rounded-ui-rect border border-[#BDBDBD] bg-[#F5F5F5] p-3 text-[13px]">
        {rows.map((row) => (
          <div key={row.labelKey} className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-[#757575]">{t(row.labelKey as never)}</dt>
            <dd className="text-right font-medium text-sam-fg">{row.value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-[#BDBDBD] pt-2">
          <dt className="text-[15px] font-bold text-sam-fg">{t("owner_ads_price_total")}</dt>
          <dd className="text-[18px] font-bold tabular-nums text-[#0A823E]">{totalDisplay}</dd>
        </div>
      </dl>

      {cashBreakdown ? (
        <dl
          className="mt-3 space-y-2 rounded-ui-rect border border-[#BDBDBD] bg-white p-3 text-[13px]"
          data-owner-ads-confirm-cash="numeric"
        >
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#757575]">
              {safeT("owner_ads_confirm_ad_amount", {
                fallbackKo: "광고 금액",
                fallbackEn: "Ad amount",
              })}
            </dt>
            <dd className="font-semibold tabular-nums text-sam-fg">
              {formatDeliveryAdPhpMinor(cashBreakdown.adAmountMinor)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#757575]">
              {safeT("owner_ads_confirm_cash_balance", {
                fallbackKo: "현재 Business Cash",
                fallbackEn: "Current Business Cash",
              })}
            </dt>
            <dd className="font-semibold tabular-nums text-sam-fg">
              {formatDeliveryAdPhpMinor(cashBreakdown.balanceMinor)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#757575]">
              {safeT("owner_ads_confirm_pay_after_approval", {
                fallbackKo: "승인 후 결제 예정",
                fallbackEn: "Due after approval",
              })}
            </dt>
            <dd className="font-semibold tabular-nums text-sam-fg">
              {formatDeliveryAdPhpMinor(cashBreakdown.adAmountMinor)}
            </dd>
          </div>
          {afterPayMinor != null ? (
            <div className="flex items-center justify-between gap-3 border-t border-[#BDBDBD] pt-2">
              <dt className="text-[#757575]">
                {safeT("owner_ads_confirm_cash_after_pay", {
                  fallbackKo: "결제 후 예상 잔액",
                  fallbackEn: "Balance after payment",
                })}
              </dt>
              <dd
                className={`font-bold tabular-nums ${
                  afterPayMinor < 0 ? "text-red-600" : "text-sam-fg"
                }`}
              >
                {formatDeliveryAdPhpMinor(afterPayMinor)}
              </dd>
            </div>
          ) : null}
          {afterPayMinor != null && afterPayMinor < 0 ? (
            <p className="text-[12px] font-medium text-red-600" role="status">
              {t("owner_ads_funding_insufficient")}
            </p>
          ) : null}
        </dl>
      ) : null}

      <p className="mt-3 rounded-ui-rect border border-[#BDBDBD] bg-[#F5F5F5] px-3 py-2 text-[12px] leading-relaxed text-[#757575]">
        {t(businessCashNoteKey as never)}
      </p>
      <ol className="mt-3 space-y-2" data-owner-ads-confirm-timeline="design-board">
        {DELIVERY_AD_OWNER_CONFIRM_TIMELINE.map(({ step, labelKey }) => (
          <li key={step} className="flex items-center gap-2 text-[13px] text-sam-fg">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0A823E] text-[11px] font-bold text-white">
              {step}
            </span>
            <span>{t(labelKey)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
