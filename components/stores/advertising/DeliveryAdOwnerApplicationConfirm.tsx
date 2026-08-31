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
  operationsCreditDisplay?: string | null;
};

/** Application confirm + Business Cash (shortage framing when underfunded). */
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

  const shortageMinor =
    cashBreakdown != null
      ? Math.max(0, cashBreakdown.adAmountMinor - cashBreakdown.balanceMinor)
      : 0;
  const insufficient = cashBreakdown != null && shortageMinor > 0;
  const afterPayMinor =
    cashBreakdown != null && !insufficient
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
          data-owner-ads-cash-wallet="ad-only"
          data-owner-ads-cash-insufficient={insufficient ? "1" : "0"}
        >
          <p className="text-[13px] font-bold text-sam-fg">
            {t("owner_ads_confirm_cash_wallet_title")}
          </p>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#757575]">{t("owner_ads_confirm_ad_amount")}</dt>
            <dd className="font-semibold tabular-nums text-sam-fg">
              {formatDeliveryAdPhpMinor(cashBreakdown.adAmountMinor)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#757575]">
              {safeT("owner_ads_confirm_cash_balance_ad", {
                fallbackKo: "광고 Business Cash",
                fallbackEn: "Ad Business Cash",
              })}
            </dt>
            <dd className="font-semibold tabular-nums text-sam-fg">
              {formatDeliveryAdPhpMinor(cashBreakdown.balanceMinor)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[#757575]">
              {safeT("owner_ads_confirm_amount_needed", {
                fallbackKo: "승인 후 필요한 금액",
                fallbackEn: "Amount needed after approval",
              })}
            </dt>
            <dd className="font-semibold tabular-nums text-sam-fg">
              {formatDeliveryAdPhpMinor(cashBreakdown.adAmountMinor)}
            </dd>
          </div>
          {insufficient ? (
            <>
              <div className="flex items-center justify-between gap-3 border-t border-[#BDBDBD] pt-2">
                <dt className="text-[#757575]">
                  {safeT("owner_ads_cash_shortage_amount", {
                    fallbackKo: "현재 부족 금액",
                    fallbackEn: "Current shortfall",
                  })}
                </dt>
                <dd className="font-bold tabular-nums text-red-600">
                  {formatDeliveryAdPhpMinor(shortageMinor)}
                </dd>
              </div>
              <p className="text-[12px] font-medium text-red-600" role="status">
                {t("owner_ads_funding_insufficient")}
              </p>
              <p className="text-[12px] leading-relaxed text-[#757575]">
                {safeT("owner_ads_cash_shortage_prep_copy", {
                  fallbackKo:
                    "광고 신청은 관리자 검수 후 결제가 필요합니다. 현재 광고 Business Cash가 부족하므로 승인 후 결제 전에 잔액을 준비해야 합니다.",
                  fallbackEn:
                    "Payment is due after admin approval. Your ad Business Cash is short, so prepare balance before funding after approval.",
                })}
              </p>
            </>
          ) : afterPayMinor != null ? (
            <div className="flex items-center justify-between gap-3 border-t border-[#BDBDBD] pt-2">
              <dt className="text-[#757575]">{t("owner_ads_confirm_cash_after_pay")}</dt>
              <dd className="font-bold tabular-nums text-sam-fg">
                {formatDeliveryAdPhpMinor(afterPayMinor)}
              </dd>
            </div>
          ) : null}
          <p className="text-[12px] leading-relaxed text-[#757575]" data-owner-ads-cash-vs-credit="1">
            {t("owner_ads_business_cash_vs_credit")}
          </p>
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
