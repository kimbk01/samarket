"use client";

import { DeliveryTheme } from "@/lib/design/delivery-theme";
import { formatMoneyPhp } from "@/lib/utils/format";

export function DeliveryPriceSummary({
  label = "총 결제금액",
  amountPhp,
  strikePhp,
  promoLine,
}: {
  label?: string;
  amountPhp: number;
  strikePhp?: number | null;
  promoLine?: string | null;
}) {
  const showStrike =
    strikePhp != null && Number.isFinite(strikePhp) && strikePhp > amountPhp;

  return (
    <div className="min-w-0 flex-1 py-0.5">
      <p className="delivery-typo-meta">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className={DeliveryTheme.priceTotal}>{formatMoneyPhp(amountPhp)}</p>
        {showStrike ? (
          <p className="text-[14px] font-medium tabular-nums text-[var(--delivery-text-disabled)] line-through">
            {formatMoneyPhp(strikePhp!)}
          </p>
        ) : null}
      </div>
      {promoLine ? (
        <p className="mt-1 text-[13px] font-semibold leading-snug text-[#5B4DFF]">{promoLine}</p>
      ) : null}
    </div>
  );
}
