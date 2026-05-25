"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { formatMoneyPhp } from "@/lib/utils/format";
import { formatPhMobileDisplay, parsePhMobileInput, telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";

function statusBadge(
  isOpen: boolean,
  t: ReturnType<typeof useI18n>["t"]
) {
  if (isOpen) {
    return (
      <span className="rounded bg-emerald-50 px-2 py-0.5 sam-text-xxs font-semibold text-emerald-800">
        {t("store_open_now")}
      </span>
    );
  }
  return (
    <span className="rounded bg-amber-50 px-2 py-0.5 sam-text-xxs font-semibold text-amber-800">
      {t("store_preparing")}
    </span>
  );
}

export type StoreCommerceSummaryCardProps = {
  storeName: string;
  isOpen: boolean;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  /** 표시용 지역 한 줄 */
  regionLabel: string;
  /** 최소주문 금액(페소). null 이면 안내 문구 */
  minOrderPhp: number | null;
  /** 배달비(페소). null 이면 안내 문구 */
  deliveryFeePhp: number | null;
  /** 예: "25~35분" */
  estPrepLabel: string;
  /** 짧은 소개 (선택) */
  intro?: string | null;
  /** 전화 (선택) */
  phone?: string | null;
  disclaimer?: string;
};

export function StoreCommerceSummaryCard({
  storeName,
  isOpen,
  deliveryAvailable,
  pickupAvailable,
  regionLabel,
  minOrderPhp,
  deliveryFeePhp,
  estPrepLabel,
  intro,
  phone,
  disclaimer,
}: StoreCommerceSummaryCardProps) {
  const { t } = useI18n();
  const resolvedDisclaimer = disclaimer ?? t("store_commerce_summary_disclaimer");
  const minOrderDd =
    minOrderPhp != null && minOrderPhp > 0 ? formatMoneyPhp(minOrderPhp) : t("store_confirm_at_order");
  const deliveryDd =
    deliveryFeePhp != null && deliveryFeePhp >= 0 ? formatMoneyPhp(deliveryFeePhp) : t("store_inquiry_title");

  return (
    <div className="mx-4 mt-3 space-y-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-sam-fg">{storeName}</h2>
        {statusBadge(isOpen, t)}
      </div>
      <div className="flex flex-wrap gap-2 sam-text-xxs">
        {deliveryAvailable ? (
          <span className="rounded border border-orange-200 bg-orange-50 px-2 py-0.5 font-medium text-orange-900">
            {t("store_delivery_available")}
          </span>
        ) : (
          <span className="rounded border border-sam-border bg-sam-app px-2 py-0.5 text-sam-muted">
            {t("store_delivery_no_short")}
          </span>
        )}
        {pickupAvailable ? (
          <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 font-medium text-sky-900">
            {t("store_pickup_available")}
          </span>
        ) : (
          <span className="rounded border border-sam-border bg-sam-app px-2 py-0.5 text-sam-muted">
            {t("store_pickup_no_short")}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 sam-text-helper text-sam-fg">
        <dt className="text-sam-muted">{t("store_min_order_short")}</dt>
        <dd className="text-right font-medium">{minOrderDd}</dd>
        <dt className="text-sam-muted">{t("store_delivery_fee")}</dt>
        <dd className="text-right font-medium">{deliveryAvailable ? deliveryDd : "—"}</dd>
        <dt className="text-sam-muted">{t("store_est_prep_short")}</dt>
        <dd className="text-right font-medium">{estPrepLabel}</dd>
        <dt className="text-sam-muted">{t("store_region_label")}</dt>
        <dd className="text-right">{regionLabel || "—"}</dd>
        {phone ? (
          <>
            <dt className="text-sam-muted">{t("store_label_contact")}</dt>
            <dd className="text-right font-medium">
              <a
                href={
                  telHrefFromLoosePhPhone(phone) ?? `tel:${phone.replace(/\s/g, "")}`
                }
                className="text-signature"
              >
                {parsePhMobileInput(phone).length === 11
                  ? formatPhMobileDisplay(parsePhMobileInput(phone))
                  : phone}
              </a>
            </dd>
          </>
        ) : null}
      </dl>
      {intro ? (
        <p className="whitespace-pre-wrap sam-text-body-secondary leading-relaxed text-sam-fg">{intro}</p>
      ) : null}
      <p className="sam-text-xxs leading-relaxed text-sam-muted">{resolvedDisclaimer}</p>
    </div>
  );
}
