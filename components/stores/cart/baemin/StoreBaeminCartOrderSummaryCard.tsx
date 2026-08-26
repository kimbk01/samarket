"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  BAEMIN_CART_FOOTER_MIN_SHORT_CLASS,
  BAEMIN_CART_SECTION_CARD_CLASS,
} from "@/lib/stores/store-baemin-cart-ui";

export function StoreBaeminCartOrderSummaryCard(props: {
  subtotalPhp: number;
  discountAmountPhp: number;
  discountPercentOverall: number;
  fulfillmentIsDelivery: boolean;
  deliveryFeeLabel: ReactNode;
  displayGrand: number;
  couponDiscountPhp?: number;
  couponTitle?: string | null;
  couponNumber?: string | null;
  /** Gift redemption — never merged into coupon/discount lines. */
  giftRedemptionPhp?: number;
  giftTitle?: string | null;
  minOrderPhp: number;
  meetsMin: boolean;
  minShortage: number;
  showFreeDeliveryProgress: boolean;
  freeDeliveryThresholdPhp: number | null;
  freeDeliveryProgressPct: number;
  freeDeliveryMet: boolean;
}) {
  const { t, safeT } = useI18n();
  const {
    subtotalPhp,
    discountAmountPhp,
    discountPercentOverall,
    fulfillmentIsDelivery,
    deliveryFeeLabel,
    displayGrand,
    couponDiscountPhp = 0,
    couponTitle = null,
    couponNumber = null,
    giftRedemptionPhp = 0,
    giftTitle = null,
    minOrderPhp,
    meetsMin,
    minShortage,
    showFreeDeliveryProgress,
    freeDeliveryThresholdPhp,
    freeDeliveryProgressPct,
    freeDeliveryMet,
  } = props;
  const couponDetail = [couponTitle, couponNumber].filter(Boolean).join(" · ");

  const showMinOrder = minOrderPhp > 0;

  return (
    <section className={`${BAEMIN_CART_SECTION_CARD_CLASS} overflow-hidden`}>
      <dl className="space-y-2.5 px-4 py-4 text-[14px]">
        <Row label={t("store_items_subtotal")} value={formatMoneyPhp(subtotalPhp)} />
        {discountAmountPhp > 0 ? (
          <Row
            label={
              <>
                {t("store_discount_amount")}
                {discountPercentOverall > 0 ? (
                  <span className="ml-1 text-[12px] font-normal text-[color:var(--delivery-text-muted)]">({discountPercentOverall}%)</span>
                ) : null}
              </>
            }
            value={`- ${formatMoneyPhp(discountAmountPhp)}`}
            valueClassName="text-[color:var(--delivery-danger)]"
          />
        ) : null}
        {couponDiscountPhp > 0 ? (
          <Row
            label={
              <>
                {t("store_owner_order_coupon_discount")}
                {couponDetail ? (
                  <span className="mt-0.5 block text-[12px] font-normal text-[color:var(--delivery-text-muted)]">
                    {couponDetail}
                  </span>
                ) : null}
              </>
            }
            value={`- ${formatMoneyPhp(couponDiscountPhp)}`}
            valueClassName="text-[color:var(--delivery-danger)]"
          />
        ) : null}
        {giftRedemptionPhp > 0 ? (
          <Row
            label={
              <>
                {safeT("gift_u4_summary_gift_line", {
                  fallbackKo: "상품권 사용",
                  fallbackEn: "Gift certificate",
                })}
                {giftTitle ? (
                  <span className="mt-0.5 block max-w-[200px] truncate text-[12px] font-normal text-[color:var(--delivery-text-muted)]">
                    {giftTitle}
                  </span>
                ) : null}
              </>
            }
            value={`- ${formatMoneyPhp(giftRedemptionPhp)}`}
            valueClassName="text-[color:var(--delivery-danger)]"
            dataAttr="data-cart-gift-summary-line"
          />
        ) : null}
        <Row
          label={t("store_estimated_delivery_fee")}
          value={fulfillmentIsDelivery ? deliveryFeeLabel : formatMoneyPhp(0)}
          valueAlign="right"
        />
      </dl>
      <div className="mx-4 border-t border-dashed border-[color:var(--delivery-border)] pt-3 pb-4">
        <div className="flex items-end justify-between gap-3">
          <span className="text-[15px] font-bold text-[color:var(--delivery-text-main)]">{t("store_payment_due")}</span>
          <span className="text-[20px] font-extrabold leading-none tabular-nums text-[color:var(--delivery-danger)]">
            {formatMoneyPhp(displayGrand)}
          </span>
        </div>
        {showMinOrder ? (
          <p className="mt-2 text-[12px] text-[color:var(--delivery-text-muted)]">
            {t("store_min_order_amount_colon", { amount: formatMoneyPhp(minOrderPhp) })}
          </p>
        ) : null}
        {showMinOrder && meetsMin ? (
          <p className="mt-1 text-[12px] font-semibold text-[color:var(--delivery-success)]">{t("store_min_order_met")}</p>
        ) : null}
        {showMinOrder && !meetsMin ? (
          <p className={`mt-1 ${BAEMIN_CART_FOOTER_MIN_SHORT_CLASS}`}>
            {t("store_min_order_add_more", { amount: formatMoneyPhp(minShortage) })}
          </p>
        ) : null}
      </div>

      {showFreeDeliveryProgress && freeDeliveryThresholdPhp != null ? (
        <div className="mx-4 mb-4 rounded-[8px] bg-[#F0F9FF] px-3 py-2.5">
          <p className="text-[13px] font-semibold text-[#0C4A6E]">
            {t("store_free_delivery_over", { amount: formatMoneyPhp(freeDeliveryThresholdPhp) })}
          </p>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#BAE6FD]"
            role="progressbar"
            aria-valuenow={Math.round(freeDeliveryProgressPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("store_free_delivery_progress_aria")}
          >
            <div
              className="h-full rounded-full bg-[#0EA5E9] transition-[width] duration-300"
              style={{ width: `${freeDeliveryProgressPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-[#0C4A6E]/80">
            {freeDeliveryMet
              ? t("store_free_delivery_met")
              : t("store_free_delivery_remaining", {
                  amount: formatMoneyPhp(Math.max(0, freeDeliveryThresholdPhp - subtotalPhp)),
                })}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Row({
  label,
  value,
  valueClassName = "text-[color:var(--delivery-text-main)]",
  valueAlign,
  dataAttr,
}: {
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
  valueAlign?: "right";
  dataAttr?: string;
}) {
  return (
    <div className="flex justify-between gap-3" {...(dataAttr ? { [dataAttr]: "1" } : {})}>
      <dt className="min-w-0 text-[color:var(--delivery-text-sub)]">{label}</dt>
      <dd
        className={`shrink-0 font-semibold tabular-nums ${valueClassName} ${valueAlign === "right" ? "text-right" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
