"use client";

import type { ReactNode } from "react";
import { formatMoneyPhp } from "@/lib/utils/format";
import { BAEMIN_CART_SECTION_CARD_CLASS } from "@/lib/stores/store-baemin-cart-ui";

export function StoreBaeminCartOrderSummaryCard(props: {
  subtotalPhp: number;
  discountAmountPhp: number;
  discountPercentOverall: number;
  fulfillmentIsDelivery: boolean;
  deliveryFeeLabel: ReactNode;
  displayGrand: number;
  minOrderPhp: number;
  meetsMin: boolean;
  minShortage: number;
  showFreeDeliveryProgress: boolean;
  freeDeliveryThresholdPhp: number | null;
  freeDeliveryProgressPct: number;
  freeDeliveryMet: boolean;
}) {
  const {
    subtotalPhp,
    discountAmountPhp,
    discountPercentOverall,
    fulfillmentIsDelivery,
    deliveryFeeLabel,
    displayGrand,
    minOrderPhp,
    meetsMin,
    minShortage,
    showFreeDeliveryProgress,
    freeDeliveryThresholdPhp,
    freeDeliveryProgressPct,
    freeDeliveryMet,
  } = props;

  return (
    <section className={`${BAEMIN_CART_SECTION_CARD_CLASS} overflow-hidden`}>
      <dl className="space-y-2.5 px-4 py-4 text-[14px]">
        <Row label="총상품금액" value={formatMoneyPhp(subtotalPhp)} />
        {discountAmountPhp > 0 ? (
          <Row
            label={
              <>
                할인금액
                {discountPercentOverall > 0 ? (
                  <span className="ml-1 text-[12px] font-normal text-[#AAA]">({discountPercentOverall}%)</span>
                ) : null}
              </>
            }
            value={`- ${formatMoneyPhp(discountAmountPhp)}`}
            valueClassName="text-[#E74C3C]"
          />
        ) : null}
        <Row
          label="예상배달비"
          value={fulfillmentIsDelivery ? deliveryFeeLabel : formatMoneyPhp(0)}
          valueAlign="right"
        />
      </dl>
      <div className="mx-4 border-t border-dashed border-[#E8E8E8] pt-3 pb-4">
        <div className="flex items-end justify-between gap-3">
          <span className="text-[15px] font-bold text-[#111]">결제예정금액</span>
          <span className="text-[20px] font-extrabold leading-none tabular-nums text-[#E74C3C]">
            {formatMoneyPhp(displayGrand)}
          </span>
        </div>
        {minOrderPhp > 0 ? (
          <p className="mt-2 text-[12px] text-[#999]">최소 주문 금액 : {formatMoneyPhp(minOrderPhp)}</p>
        ) : null}
        {minOrderPhp > 0 && !meetsMin ? (
          <p className="mt-1 text-[12px] font-medium text-[#B45309]">
            {formatMoneyPhp(minShortage)} 더 담아 최소 주문을 맞춰 주세요.
          </p>
        ) : null}
      </div>

      {showFreeDeliveryProgress && freeDeliveryThresholdPhp != null ? (
        <div className="mx-4 mb-4 rounded-[8px] bg-[#F0F9FF] px-3 py-2.5">
          <p className="text-[13px] font-semibold text-[#0C4A6E]">
            {formatMoneyPhp(freeDeliveryThresholdPhp)} 이상 주문 시 무료배달
          </p>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#BAE6FD]"
            role="progressbar"
            aria-valuenow={Math.round(freeDeliveryProgressPct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-[#0EA5E9] transition-[width] duration-300"
              style={{ width: `${freeDeliveryProgressPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-[#0C4A6E]/80">
            {freeDeliveryMet
              ? "무료배달 조건을 충족했습니다."
              : `${formatMoneyPhp(Math.max(0, freeDeliveryThresholdPhp - subtotalPhp))} 더 담으면 배달비가 면제될 수 있어요.`}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Row({
  label,
  value,
  valueClassName = "text-[#111]",
  valueAlign,
}: {
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
  valueAlign?: "right";
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#888]">{label}</dt>
      <dd
        className={`shrink-0 font-semibold tabular-nums ${valueClassName} ${valueAlign === "right" ? "text-right" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

